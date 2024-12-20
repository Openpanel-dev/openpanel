import zlib from 'node:zlib';
import compress from '@fastify/compress';
import cookie from '@fastify/cookie';
import cors, { type FastifyCorsOptions } from '@fastify/cors';
import type { FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import type { FastifyBaseLogger, FastifyRequest } from 'fastify';
import Fastify from 'fastify';
import metricsPlugin from 'fastify-metrics';

import { generateId } from '@openpanel/common';
import type { IServiceClientWithProject } from '@openpanel/db';
import { getRedisPub } from '@openpanel/redis';
import type { AppRouter } from '@openpanel/trpc';
import { appRouter, createContext } from '@openpanel/trpc';

import {
  EMPTY_SESSION,
  type SessionValidationResult,
  validateSessionToken,
} from '@openpanel/auth';
import sourceMapSupport from 'source-map-support';
import {
  healthcheck,
  healthcheckQueue,
} from './controllers/healthcheck.controller';
import { ipHook } from './hooks/ip.hook';
import { requestIdHook } from './hooks/request-id.hook';
import { requestLoggingHook } from './hooks/request-logging.hook';
import { timestampHook } from './hooks/timestamp.hook';
import eventRouter from './routes/event.router';
import exportRouter from './routes/export.router';
import importRouter from './routes/import.router';
import liveRouter from './routes/live.router';
import miscRouter from './routes/misc.router';
import oauthRouter from './routes/oauth-callback.router';
import profileRouter from './routes/profile.router';
import trackRouter from './routes/track.router';
import webhookRouter from './routes/webhook.router';
import { logger } from './utils/logger';

sourceMapSupport.install();

declare module 'fastify' {
  interface FastifyRequest {
    client: IServiceClientWithProject | null;
    clientIp?: string;
    timestamp?: number;
    session: SessionValidationResult;
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

    fastify.register(cors, () => {
      return (
        req: FastifyRequest,
        callback: (error: Error | null, options: FastifyCorsOptions) => void,
      ) => {
        // TODO: set prefix on dashboard routes
        const corsPaths = ['/trpc', '/live', '/webhook', '/oauth', '/misc'];

        const isPrivatePath = corsPaths.some((path) =>
          req.url.startsWith(path),
        );

        if (isPrivatePath) {
          return callback(null, {
            origin: process.env.NEXT_PUBLIC_DASHBOARD_URL,
            credentials: true,
          });
        }

        return callback(null, {
          origin: '*',
        });
      };
    });

    fastify.addHook('preHandler', ipHook);
    fastify.addHook('preHandler', timestampHook);
    fastify.addHook('onRequest', requestIdHook);
    fastify.addHook('onResponse', requestLoggingHook);

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

    // Dashboard API
    fastify.register((instance, opts, done) => {
      instance.register(cookie, {
        secret: process.env.COOKIE_SECRET ?? '',
        hook: 'onRequest',
        parseOptions: {},
      });

      instance.addHook('onRequest', (req, reply, done) => {
        if (req.cookies?.session) {
          validateSessionToken(req.cookies.session)
            .then((session) => {
              if (session.session) {
                req.session = session;
              }
            })
            .catch(() => {
              req.session = EMPTY_SESSION;
            })
            .finally(() => {
              done();
            });
        } else {
          req.session = EMPTY_SESSION;
          done();
        }
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
      instance.register(webhookRouter, { prefix: '/webhook' });
      instance.register(oauthRouter, { prefix: '/oauth' });
      instance.register(miscRouter, { prefix: '/misc' });
      done();
    });

    // Public API
    fastify.register((instance, opts, done) => {
      instance.register(metricsPlugin, { endpoint: '/metrics' });
      instance.register(eventRouter, { prefix: '/event' });
      instance.register(profileRouter, { prefix: '/profile' });
      instance.register(exportRouter, { prefix: '/export' });
      instance.register(importRouter, { prefix: '/import' });
      instance.register(trackRouter, { prefix: '/track' });
      instance.get('/healthcheck', healthcheck);
      instance.get('/healthcheck/queue', healthcheckQueue);
      instance.get('/', (_request, reply) =>
        reply.send({ name: 'openpanel sdk api' }),
      );
      done();
    });

    fastify.setErrorHandler((error, request, reply) => {
      if (error.statusCode === 429) {
        reply.status(429).send({
          status: 429,
          error: 'Too Many Requests',
          message: 'You have exceeded the rate limit for this endpoint.',
        });
      } else {
        request.log.error('request error', { error });
        reply.status(500).send('Internal server error');
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

    try {
      // Notify when keys expires
      await getRedisPub().config('SET', 'notify-keyspace-events', 'Ex');
    } catch (error) {
      logger.warn('Failed to set redis notify-keyspace-events', error);
      logger.warn(
        'If you use a managed Redis service, you may need to set this manually.',
      );
      logger.warn('Otherwise some functions may not work as expected.');
    }
  } catch (error) {
    logger.error('Failed to start server', error);
  }
};

startServer();
