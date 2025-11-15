import { ch, db } from '@openpanel/db';
import {
  cronQueue,
  eventsGroupQueues,
  miscQueue,
  notificationQueue,
  sessionsQueue,
} from '@openpanel/queue';
import {
  getRedisCache,
  getRedisPub,
  getRedisQueue,
  getRedisSub,
} from '@openpanel/redis';
import type { FastifyInstance } from 'fastify';
import { logger } from './logger';

let shuttingDown = false;

export function setShuttingDown(value: boolean) {
  shuttingDown = value;
}

export function isShuttingDown() {
  return shuttingDown;
}

// Graceful shutdown handler
export async function shutdown(
  fastify: FastifyInstance,
  signal: string,
  exitCode = 0,
) {
  if (isShuttingDown()) {
    logger.warn('Shutdown already in progress, ignoring signal', { signal });
    return;
  }

  logger.info('Starting graceful shutdown', { signal });

  setShuttingDown(true);

  // Step 2: Wait for load balancer to stop sending traffic (matches preStop sleep)
  const gracePeriod = Number(process.env.SHUTDOWN_GRACE_PERIOD_MS || '5000');
  await new Promise((resolve) => setTimeout(resolve, gracePeriod));

  // Step 3: Close Fastify to drain in-flight requests
  try {
    await fastify.close();
    logger.info('Fastify server closed');
  } catch (error) {
    logger.error('Error closing Fastify server', error);
  }

  // Step 4: Close database connections
  try {
    await db.$disconnect();
    logger.info('Database connection closed');
  } catch (error) {
    logger.error('Error closing database connection', error);
  }

  // Step 5: Close ClickHouse connections
  try {
    await ch.close();
    logger.info('ClickHouse connections closed');
  } catch (error) {
    logger.error('Error closing ClickHouse connections', error);
  }

  // Step 6: Close Bull queues (graceful shutdown of queue state)
  try {
    await Promise.all([
      ...eventsGroupQueues.map((queue) => queue.close()),
      sessionsQueue.close(),
      cronQueue.close(),
      miscQueue.close(),
      notificationQueue.close(),
    ]);
    logger.info('Queue state closed');
  } catch (error) {
    logger.error('Error closing queue state', error);
  }

  // Step 7: Close Redis connections
  try {
    const redisConnections = [
      getRedisCache(),
      getRedisPub(),
      getRedisSub(),
      getRedisQueue(),
    ];

    await Promise.all(
      redisConnections.map(async (redis) => {
        if (redis.status === 'ready') {
          await redis.quit();
        }
      }),
    );
    logger.info('Redis connections closed');
  } catch (error) {
    logger.error('Error closing Redis connections', error);
  }

  logger.info('Graceful shutdown completed');
  process.exit(exitCode);
}
