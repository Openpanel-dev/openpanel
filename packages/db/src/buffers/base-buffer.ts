import { generateSecureId } from '@openpanel/common/server/id';
import { type ILogger, createLogger } from '@openpanel/logger';
import { Redis, getRedisCache } from '@openpanel/redis';

export class BaseBuffer {
  name: string;
  logger: ILogger;
  lockKey: string;
  lockTimeout = 60;
  onFlush: () => void;

  // Optional buffer counter key for incremental size tracking
  protected bufferCounterKey?: string;

  constructor(options: {
    name: string;
    onFlush: () => Promise<void>;
    bufferCounterKey?: string;
  }) {
    this.logger = createLogger({ name: options.name });
    this.name = options.name;
    this.lockKey = `lock:${this.name}`;
    this.onFlush = options.onFlush;
    this.bufferCounterKey = options.bufferCounterKey;
  }

  protected chunks<T>(items: T[], size: number) {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Utility method to safely get buffer size with counter fallback
   */
  protected async getBufferSizeWithCounter(
    fallbackFn: () => Promise<number>,
    counterKey?: string,
  ): Promise<number> {
    const key = counterKey || this.bufferCounterKey;
    if (!key) {
      return fallbackFn();
    }

    try {
      const counterValue = await getRedisCache().get(key);
      if (counterValue) {
        return Math.max(0, Number.parseInt(counterValue, 10));
      }

      // Initialize counter with current size
      const count = await fallbackFn();
      await getRedisCache().set(key, count.toString());
      return count;
    } catch (error) {
      this.logger.warn(
        'Failed to get buffer size from counter, using fallback',
        { error },
      );
      return fallbackFn();
    }
  }

  private async releaseLock(lockId: string): Promise<void> {
    this.logger.debug('Releasing lock...');
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await getRedisCache().eval(script, 1, this.lockKey, lockId);
  }

  async tryFlush() {
    const now = performance.now();
    const lockId = generateSecureId('lock');
    const acquired = await getRedisCache().set(
      this.lockKey,
      lockId,
      'EX',
      this.lockTimeout,
      'NX',
    );
    if (acquired === 'OK') {
      try {
        this.logger.info('Acquired lock. Processing buffer...', {
          lockId,
        });
        await this.onFlush();
      } catch (error) {
        this.logger.error('Failed to process buffer', {
          error,
          lockId,
        });
        // On error, we might want to reset counter to avoid drift
        if (this.bufferCounterKey) {
          this.logger.warn('Resetting buffer counter due to flush error');
          await getRedisCache().del(this.bufferCounterKey);
        }
      } finally {
        await this.releaseLock(lockId);
        this.logger.info('Flush completed', {
          elapsed: performance.now() - now,
          lockId,
        });
      }
    }
  }
}
