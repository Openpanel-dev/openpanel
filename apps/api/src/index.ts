import zlib from 'node:zlib';
import { clerkPlugin } from '@clerk/fastify';
import compress from '@fastify/compress';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import type { FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import type { FastifyBaseLogger, FastifyRequest } from 'fastify';
import Fastify from 'fastify';
import metricsPlugin from 'fastify-metrics';
import { path } from 'ramda';

import { generateId, round } from '@openpanel/common';
import { TABLE_NAMES, chQuery, db } from '@openpanel/db';
import type { IServiceClient } from '@openpanel/db';
import { eventsQueue } from '@openpanel/queue';
import { getRedisCache, getRedisPub } from '@openpanel/redis';
import type { AppRouter } from '@openpanel/trpc';
import { appRouter, createContext } from '@openpanel/trpc';

import eventRouter from './routes/event.router';
import exportRouter from './routes/export.router';
import importRouter from './routes/import.router';
import liveRouter from './routes/live.router';
import miscRouter from './routes/misc.router';
import profileRouter from './routes/profile.router';
import trackRouter from './routes/track.router';
import webhookRouter from './routes/webhook.router';
import { logger } from './utils/logger';

declare module 'fastify' {
  interface FastifyRequest {
    projectId: string;
    client: IServiceClient | null;
  }
}

async function withTimings<T>(promise: Promise<T>) {
  const time = performance.now();
  try {
    const data = await promise;
    return {
      time: round(performance.now() - time, 2),
      data,
    } as const;
  } catch (e) {
    return null;
  }
}

const port = Number.parseInt(process.env.API_PORT || '3000', 10);

const startServer = async () => {
  logger.info('Starting server');
  try {
    const fastify = Fastify({
      maxParamLength: 15_000,
      bodyLimit: 1048576 * 500, // 500MB
      logger: logger as unknown as FastifyBaseLogger,
      disableRequestLogging: true,
      genReqId: (req) =>
        req.headers['request-id']
          ? String(req.headers['request-id'])
          : generateId(),
    });

    const getTrpcInput = (
      request: FastifyRequest,
    ): Record<string, unknown> | undefined => {
      const input = path(['query', 'input'], request);
      try {
        return typeof input === 'string' ? JSON.parse(input).json : input;
      } catch (e) {
        return undefined;
      }
    };

    // add header to request if it does not exist
    fastify.addHook('onRequest', (request, reply, done) => {
      if (!request.headers['request-id']) {
        request.headers['request-id'] = request.id;
      }
      done();
    });

    const ignoreLog = ['/healthcheck', '/metrics', '/misc'];
    const ignoreMethods = ['OPTIONS'];

    fastify.addHook('onRequest', (request, reply, done) => {
      if (ignoreMethods.includes(request.method)) {
        return done();
      }
      if (ignoreLog.some((path) => request.url.startsWith(path))) {
        return done();
      }
      if (request.url.includes('trpc')) {
        request.log.info('request incoming', {
          url: request.url.split('?')[0],
          method: request.method,
          input: getTrpcInput(request),
        });
      } else {
        request.log.info('request incoming', {
          url: request.url,
          method: request.method,
        });
      }
      done();
    });

    fastify.addHook('onResponse', (request, reply, done) => {
      if (ignoreMethods.includes(request.method)) {
        return done();
      }
      if (ignoreLog.some((path) => request.url.startsWith(path))) {
        return done();
      }
      if (request.url.includes('trpc')) {
        request.log.info('request done', {
          url: request.url.split('?')[0],
          method: request.method,
          input: getTrpcInput(request),
          responseTime: reply.elapsedTime,
        });
      } else {
        request.log.info('request done', {
          url: request.url,
          method: request.method,
          responseTime: reply.elapsedTime,
        });
      }
      done();
    });

    fastify.register(compress, {
      global: false,
      encodings: ['gzip', 'deflate'],
    });

    fastify.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (req, body, done) => {
        const isGzipped = req.headers['content-encoding'] === 'gzip';

        if (isGzipped) {
          zlib.gunzip(body, (err, decompressedBody) => {
            console.log(
              'decompressedBody',
              decompressedBody.toString().slice(0, 100),
            );
            if (err) {
              done(err);
            } else {
              try {
                const json = JSON.parse(decompressedBody.toString());
                done(null, json);
              } catch (parseError) {
                done(new Error('Invalid JSON'));
              }
            }
          });
        } else {
          try {
            const json = JSON.parse(body.toString());
            done(null, json);
          } catch (parseError) {
            done(new Error('Invalid JSON'));
          }
        }
      },
    );

    await fastify.register(metricsPlugin, { endpoint: '/metrics' });

    fastify.register(cors, {
      origin: '*',
      credentials: true,
    });

    fastify.register((instance, opts, done) => {
      fastify.register(cookie, {
        secret: 'random', // for cookies signature
        hook: 'onRequest',
      });
      instance.register(clerkPlugin, {
        publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
        secretKey: process.env.CLERK_SECRET_KEY,
      });
      instance.register(fastifyTRPCPlugin, {
        prefix: '/trpc',
        trpcOptions: {
          router: appRouter,
          createContext: createContext,
          onError(ctx) {
            ctx.req.log.error('trpc error', {
              error: ctx.error,
              path: ctx.path,
              input: ctx.input,
              type: ctx.type,
            });
          },
        } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'],
      });
      instance.register(liveRouter, { prefix: '/live' });
      done();
    });

    fastify.decorateRequest('projectId', '');
    fastify.register(eventRouter, { prefix: '/event' });
    fastify.register(profileRouter, { prefix: '/profile' });
    fastify.register(miscRouter, { prefix: '/misc' });
    fastify.register(exportRouter, { prefix: '/export' });
    fastify.register(webhookRouter, { prefix: '/webhook' });
    fastify.register(importRouter, { prefix: '/import' });
    fastify.register(trackRouter, { prefix: '/track' });
    fastify.setErrorHandler((error, request, reply) => {
      request.log.error('request error', { error });
      reply.status(500).send('Internal server error');
    });
    fastify.get('/', (_request, reply) => {
      reply.send({ name: 'openpanel sdk api' });
    });
    fastify.get('/healthcheck', async (request, reply) => {
      const redisRes = await withTimings(getRedisCache().keys('*'));
      const dbRes = await withTimings(db.project.findFirst());
      const queueRes = await withTimings(eventsQueue.getCompleted());
      const chRes = await withTimings(
        chQuery(`SELECT * FROM ${TABLE_NAMES.events} LIMIT 1`),
      );
      const status = redisRes && dbRes && queueRes && chRes ? 200 : 500;

      reply.status(status).send({
        redis: redisRes
          ? {
              ok: !!redisRes.data.length,
              time: `${redisRes.time}ms`,
            }
          : null,
        db: dbRes
          ? {
              ok: !!dbRes.data,
              time: `${dbRes.time}ms`,
            }
          : null,
        queue: queueRes
          ? {
              ok: !!queueRes.data,
              time: `${queueRes.time}ms`,
            }
          : null,
        ch: chRes
          ? {
              ok: !!chRes.data,
              time: `${chRes.time}ms`,
            }
          : null,
      });
    });
    fastify.get('/healthcheck/queue', async (request, reply) => {
      const count = await eventsQueue.getWaitingCount();
      if (count > 40) {
        reply.status(500).send({
          ok: false,
          count,
        });
      } else {
        reply.status(200).send({
          ok: true,
          count,
        });
      }
    });
    if (process.env.NODE_ENV === 'production') {
      for (const signal of ['SIGINT', 'SIGTERM']) {
        process.on(signal, (error) => {
          logger.error(`uncaught exception detected ${signal}`, error);
          fastify.close().then((error) => {
            process.exit(error ? 1 : 0);
          });
        });
      }
    }

    await fastify.listen({
      host: process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost',
      port,
    });

    // Notify when keys expires
    getRedisPub().config('SET', 'notify-keyspace-events', 'Ex');
  } catch (error) {
    logger.error('Failed to start server', error);
  }
};

startServer();
