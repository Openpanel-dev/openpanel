import { getLock, getRedisCache } from '@openpanel/redis';
import { logger } from './logger';

/**
 * Acquires a distributed lock to ensure only one instance of a worker group runs.
 * If the lock cannot be acquired, the process exits.
 *
 * @param key - The lock key (e.g., 'utility-queues')
 * @param ttlMs - Time to live for the lock in milliseconds (default: 60000)
 * @returns A cleanup function that releases the lock
 */
export async function requireSingleton(
  key: string,
  ttlMs = 60_000,
): Promise<() => void> {
  const lockKey = `lock:singleton:${key}`;
  const lockValue = `${process.pid}-${Date.now()}`;

  // Try to acquire the lock
  const acquired = await getLock(lockKey, lockValue, ttlMs);

  if (!acquired) {
    logger.error(
      `Another instance holds singleton lock for "${key}". Exiting.`,
      { key },
    );
    process.exit(0);
  }

  logger.debug('Acquired singleton lock', { key, ttlMs, lockValue });

  // Set up automatic extension to keep the lock alive
  const extensionInterval = setInterval(async () => {
    try {
      // Extend the lock by setting it again with the same value
      const redis = getRedisCache();
      const result = await redis.set(lockKey, lockValue, 'PX', ttlMs, 'XX');

      if (result === 'OK') {
        logger.debug('Extended singleton lock', { key });
      } else {
        // Lock was lost (someone else acquired it or it expired)
        logger.error('Lost singleton lock - exiting', { key });
        clearInterval(extensionInterval);
        process.exit(1);
      }
    } catch (error: unknown) {
      logger.error('Failed to extend singleton lock - exiting', {
        key,
        error,
      });
      clearInterval(extensionInterval);
      process.exit(1);
    }
  }, ttlMs / 2);

  // Return cleanup function
  return () => {
    clearInterval(extensionInterval);
    getRedisCache()
      .del(lockKey)
      .then(() => {
        logger.debug('Released singleton lock', { key });
      })
      .catch((error: unknown) => {
        logger.error('Failed to release singleton lock', { key, error });
      });
  };
}
