import { generateSecureId } from '@openpanel/common/server/id';
import { type ILogger, createLogger } from '@openpanel/logger';
import { getRedisCache } from '@openpanel/redis';

export class BaseBuffer {
  name: string;
  logger: ILogger;
  lockKey: string;
  lockTimeout = 60;
  onFlush: () => void;

  constructor(options: {
    name: string;
    onFlush: () => Promise<void>;
  }) {
    this.logger = createLogger({ name: options.name });
    this.name = options.name;
    this.lockKey = `lock:${this.name}`;
    this.onFlush = options.onFlush;
  }

  protected chunks<T>(items: T[], size: number) {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size));
    }
    return chunks;
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
