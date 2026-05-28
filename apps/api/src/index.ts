/** biome-ignore-all lint/suspicious/useAwait: fastify need async or done callbacks */
process.env.TZ = 'UTC';

import sourceMapSupport from 'source-map-support';
import { buildApp } from './app';
import { shutdown } from './utils/graceful-shutdown';
import { logger } from './utils/logger';
import { getRedisPub } from '@openpanel/redis';

sourceMapSupport.install();

const port = Number.parseInt(process.env.API_PORT || '3000', 10);
const host =
  process.env.API_HOST ||
  (process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost');

const startServer = async () => {
  logger.info('Starting server');
  try {
    const fastify = await buildApp();

    if (process.env.NODE_ENV === 'production') {
      logger.info('Registering graceful shutdown handlers');
      process.on('SIGTERM', async () => await shutdown(fastify, 'SIGTERM', 0));
      process.on('SIGINT', async () => await shutdown(fastify, 'SIGINT', 0));

      // After an uncaughtException / unhandledRejection the process state
      // is corrupt — don't try to gracefully drain queues/DBs. Log and
      // exit immediately so Docker can respawn the container. Anything
      // slower than this lets bad requests keep hitting a poisoned process
      // and risks blocking past Docker's stop_grace_period (→ SIGKILL).
      process.on('uncaughtException', (error) => {
        logger.fatal({ err: error }, 'Uncaught exception — exiting');
        // Flush pino, then hard-exit. unref() so the safety net doesn't
        // keep the loop alive on its own.
        setTimeout(() => process.exit(1), 1000).unref();
      });
      process.on('unhandledRejection', (reason, promise) => {
        logger.fatal({ reason, promise }, 'Unhandled rejection — exiting');
        setTimeout(() => process.exit(1), 1000).unref();
      });
    }

    await fastify.listen({ host, port });

    try {
      await getRedisPub().config('SET', 'notify-keyspace-events', 'Ex');
    } catch (error) {
      logger.warn({ err: error }, 'Failed to set redis notify-keyspace-events');
      logger.warn(
        'If you use a managed Redis service, you may need to set this manually.',
      );
      logger.warn('Otherwise some functions may not work as expected.');
    }
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server');
  }
};

startServer();
