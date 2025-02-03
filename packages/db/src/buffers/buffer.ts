import { generateId, getSafeJson } from '@openpanel/common';
import type { ILogger } from '@openpanel/logger';
import { createLogger } from '@openpanel/logger';
import { getRedisCache } from '@openpanel/redis';
import { pathOr } from 'ramda';

export type Find<T, R = unknown> = (
  callback: (item: T) => boolean,
) => Promise<R | null>;

export type FindMany<T, R = unknown> = (
  callback: (item: T) => boolean,
) => Promise<R[]>;

export class RedisBuffer<T> {
  public name: string;
  protected prefix = 'op:buffer';
  protected bufferKey: string;
  private lockKey: string;
  protected maxBufferSize: number | null;
  protected logger: ILogger;

  constructor(bufferName: string, maxBufferSize: number | null) {
    this.name = bufferName;
    this.bufferKey = bufferName;
    this.lockKey = `lock:${bufferName}`;
    this.maxBufferSize = maxBufferSize;
    this.logger = createLogger({ name: 'buffer' }).child({
      buffer: bufferName,
    });
  }

  protected getKey(name?: string) {
    const key = `${this.prefix}:${this.bufferKey}`;
    if (name) {
      return `${key}:${name}`;
    }
    return key;
  }

  async add(item: T): Promise<void> {
    try {
      this.onAdd(item);
      await getRedisCache().rpush(this.getKey(), JSON.stringify(item));
      const bufferSize = await getRedisCache().llen(this.getKey());

      this.logger.debug(
        `Item added (${pathOr('unknown', ['id'], item)}) Current size: ${bufferSize}`,
      );

      if (this.maxBufferSize && bufferSize >= this.maxBufferSize) {
        await this.tryFlush();
      }
    } catch (error) {
      this.logger.error('Failed to add item to buffer', { error, item });
    }
  }

  public async tryFlush(): Promise<void> {
    const lockId = generateId();
    const acquired = await getRedisCache().set(
      this.lockKey,
      lockId,
      'EX',
      60,
      'NX',
    );

    if (acquired === 'OK') {
      this.logger.info(`Lock acquired. Attempting to flush. ID: ${lockId}`);
      try {
        await this.flush();
      } catch (error) {
        this.logger.error(`Failed to flush buffer. ID: ${lockId}`, { error });
      } finally {
        this.logger.info(`Releasing lock. ID: ${lockId}`);
        await this.releaseLock(lockId);
      }
    } else {
      this.logger.warn(`Failed to acquire lock. Skipping flush. ID: ${lockId}`);
    }
  }

  protected async waitForReleasedLock(
    maxWaitTime = 8000,
    checkInterval = 250,
  ): Promise<boolean> {
    const startTime = performance.now();

    while (performance.now() - startTime < maxWaitTime) {
      const lock = await getRedisCache().get(this.lockKey);
      if (!lock) {
        return true;
      }

      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }

    this.logger.warn('Timeout waiting for lock release');
    return false;
  }

  private async retryOnce(cb: () => Promise<void>) {
    try {
      await cb();
    } catch (e) {
      this.logger.error(`#1 Failed to execute callback: ${cb.name}`, e);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        await cb();
      } catch (e) {
        this.logger.error(`#2 Failed to execute callback: ${cb.name}`, e);
        throw e;
      }
    }
  }

  private async flush(): Promise<void> {
    // Use a transaction to ensure atomicity
    const result = await getRedisCache()
      .multi()
      .lrange(this.getKey(), 0, -1)
      .lrange(this.getKey('backup'), 0, -1)
      .del(this.getKey())
      .exec();

    if (!result) {
      this.logger.error('No result from redis transaction', {
        result,
      });
      throw new Error('Redis transaction failed');
    }

    const lrange = result[0];
    const lrangePrevious = result[1];

    if (!lrange || lrange[0] instanceof Error) {
      this.logger.error('Error from lrange', {
        result,
      });
      throw new Error('Redis transaction failed');
    }

    const items = lrange[1] as string[];
    if (
      lrangePrevious &&
      lrangePrevious[0] === null &&
      Array.isArray(lrangePrevious[1])
    ) {
      items.push(...(lrangePrevious[1] as string[]));
    }

    const parsedItems = items
      .map((item) => getSafeJson<T | null>(item) as T | null)
      .filter((item): item is T => item !== null);

    if (parsedItems.length === 0) {
      this.logger.debug('No items to flush');
      // Clear any existing backup since we have no items to process
      await getRedisCache().del(this.getKey('backup'));
      return;
    }

    this.logger.info(`Flushing ${parsedItems.length} items`);

    try {
      // Create backup before processing
      await getRedisCache().del(this.getKey('backup')); // Clear any existing backup first
      await getRedisCache().lpush(
        this.getKey('backup'),
        ...parsedItems.map((item) => JSON.stringify(item)),
      );

      const { toInsert, toKeep } = await this.processItems(parsedItems);

      if (toInsert.length) {
        await this.retryOnce(() => this.insertIntoDB(toInsert));
        this.onInsert(toInsert);
      }

      // Add back items to keep
      if (toKeep.length > 0) {
        await getRedisCache().lpush(
          this.getKey(),
          ...toKeep.map((item) => JSON.stringify(item)),
        );
      }

      // Clear backup
      await getRedisCache().del(this.getKey('backup'));

      this.logger.info(
        `Inserted ${toInsert.length} items into DB, kept ${toKeep.length} items in buffer`,
        {
          toInsert: toInsert.length,
          toKeep: toKeep.length,
        },
      );
    } catch (error) {
      this.logger.error('Failed to process queue while flushing buffer', {
        error,
        queueSize: parsedItems.length,
      });

      if (parsedItems.length > 0) {
        // Add back items to keep
        this.logger.info('Adding all items back to buffer');
        await getRedisCache().lpush(
          this.getKey(),
          ...parsedItems.map((item) => JSON.stringify(item)),
        );
      }

      // Clear the backup since we're adding items back to main buffer
      await getRedisCache().del(this.getKey('backup'));
    }
  }

  private async releaseLock(lockId: string): Promise<void> {
    this.logger.debug(`Released lock for ${this.getKey()}`);
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await getRedisCache().eval(script, 1, this.lockKey, lockId);
  }

  protected async getQueue(count?: number): Promise<T[]> {
    try {
      const items = await getRedisCache().lrange(this.getKey(), 0, count ?? -1);
      return items
        .map((item) => getSafeJson<T | null>(item) as T | null)
        .filter((item): item is T => item !== null);
    } catch (error) {
      this.logger.error('Failed to get queue', { error });
      return [];
    }
  }

  protected processItems(items: T[]): Promise<{ toInsert: T[]; toKeep: T[] }> {
    return Promise.resolve({ toInsert: items, toKeep: [] });
  }

  protected insertIntoDB(_items: T[]): Promise<void> {
    throw new Error('Not implemented');
  }

  protected onAdd(_item: T): void {
    // Override in subclass
  }

  protected onInsert(_item: T[]): void {
    // Override in subclass
  }

  public findMany: FindMany<T, unknown> = () => {
    return Promise.resolve([]);
  };

  public find: Find<T, unknown> = () => {
    return Promise.resolve(null);
  };
}
