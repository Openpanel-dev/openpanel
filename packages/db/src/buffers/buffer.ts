import { v4 as uuidv4 } from 'uuid';

import type { ILogger } from '@openpanel/logger';
import { createLogger } from '@openpanel/logger';
import { getRedisCache } from '@openpanel/redis';

export type Find<T, R = unknown> = (
  callback: (item: T) => boolean,
) => Promise<R | null>;

export type FindMany<T, R = unknown> = (
  callback: (item: T) => boolean,
) => Promise<R[]>;

export class RedisBuffer<T> {
  protected prefix = 'op:buffer';
  protected bufferKey: string;
  private lockKey: string;
  protected maxBufferSize: number | null;
  protected logger: ILogger;

  constructor(bufferName: string, maxBufferSize: number | null) {
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

      this.logger.debug(`Item added. Current size: ${bufferSize}`);

      if (this.maxBufferSize && bufferSize >= this.maxBufferSize) {
        await this.tryFlush();
      }
    } catch (error) {
      this.logger.error('Failed to add item to buffer', { error, item });
    }
  }

  public async tryFlush(): Promise<void> {
    const lockId = uuidv4();
    const acquired = await getRedisCache().set(
      this.lockKey,
      lockId,
      'EX',
      8,
      'NX',
    );

    if (acquired === 'OK') {
      this.logger.debug('Lock acquired. Attempting to flush.');
      try {
        await this.flush();
      } finally {
        await this.releaseLock(lockId);
      }
    } else {
      this.logger.debug('Failed to acquire lock for. Skipping flush.');
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
      .del(this.getKey())
      .exec();

    if (!result) {
      throw new Error('Redis transaction failed');
    }

    const lrange = result[0];

    if (!lrange || lrange[0] instanceof Error) {
      throw new Error('Redis transaction failed');
    }

    const items = lrange[1] as string[];

    const parsedItems = items.map((item) => JSON.parse(item) as T);

    if (parsedItems.length === 0) {
      this.logger.debug('No items to flush');
      return;
    }

    this.logger.info(`Flushing ${parsedItems.length} items`);

    try {
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
        queueSize: items.length,
      });

      if (items.length > 0) {
        // Add back items to keep
        this.logger.info('Adding all items back to buffer');
        await getRedisCache().lpush(
          this.getKey(),
          ...items.map((item) => JSON.stringify(item)),
        );
      }
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
    const items = await getRedisCache().lrange(this.getKey(), 0, count ?? -1);
    return items.map((item) => JSON.parse(item) as T);
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
