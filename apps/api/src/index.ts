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
      process.on('uncaughtException', async (error) => {
        logger.error({ err: error }, 'Uncaught exception');
        await shutdown(fastify, 'uncaughtException', 1);
      });
      process.on('unhandledRejection', async (reason, promise) => {
        logger.error({ reason, promise }, 'Unhandled rejection');
        await shutdown(fastify, 'unhandledRejection', 1);
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
