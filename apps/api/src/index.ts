import { clerkPlugin } from '@clerk/fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import type { FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import Fastify from 'fastify';
import metricsPlugin from 'fastify-metrics';

import { db } from '@openpanel/db';
import type { IServiceClient } from '@openpanel/db';
import { eventsQueue } from '@openpanel/queue';
import { redis, redisPub } from '@openpanel/redis';
import type { AppRouter } from '@openpanel/trpc';
import { appRouter, createContext } from '@openpanel/trpc';

import eventRouter from './routes/event.router';
import exportRouter from './routes/export.router';
import liveRouter from './routes/live.router';
import miscRouter from './routes/misc.router';
import profileRouter from './routes/profile.router';
import { logger, logInfo } from './utils/logger';

declare module 'fastify' {
  interface FastifyRequest {
    projectId: string;
    client: IServiceClient | null;
  }
}

const port = parseInt(process.env.API_PORT || '3000', 10);

const startServer = async () => {
  logInfo('Starting server');
  try {
    const fastify = Fastify({
      maxParamLength: 15_000,
    });

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
          onError(error: unknown) {
            if (error instanceof Error) {
              logger.error(error, error.message);
            } else if (error && typeof error === 'object' && 'error' in error) {
              logger.error(error.error, 'Unknown error trpc error');
            }
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
    fastify.setErrorHandler((error) => {
      logger.error(error, 'Error in request');
    });
    fastify.get('/', (_request, reply) => {
      reply.send({ name: 'openpanel sdk api' });
    });
    fastify.get('/healthcheck', async (request, reply) => {
      try {
        const [redisRes, dbRes, queueRes] = await Promise.all([
          redis.keys('*'),
          db.project.findFirst(),
          eventsQueue.getCompleted(),
        ]);
        reply.send({
          redis: redisRes.length > 0,
          db: dbRes ? true : false,
          queue: queueRes.length > 0,
        });
      } catch (e) {
        reply.status(500).send();
      }
    });
    if (process.env.NODE_ENV === 'production') {
      for (const signal of ['SIGINT', 'SIGTERM']) {
        process.on(signal, (err) => {
          logger.fatal(err, `uncaught exception detected ${signal}`);
          fastify.close().then((err) => {
            process.exit(err ? 1 : 0);
          });
        });
      }
    }

    await fastify.listen({
      host: process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost',
      port,
    });

    // Notify when keys expires
    redisPub.config('SET', 'notify-keyspace-events', 'Ex');
  } catch (e) {
    logger.error(e, 'Failed to start server');
  }
};

startServer();
