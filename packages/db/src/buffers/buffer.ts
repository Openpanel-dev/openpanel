import type { Redis } from '@openpanel/redis';

export const DELETE = '__DELETE__';

export type QueueItem<T> = {
  event: T;
  index: number;
};

export type OnInsert<T> = (data: T) => unknown;

export type OnCompleted<T> =
  | ((data: T[]) => Promise<unknown[]>)
  | ((data: T[]) => unknown[]);

export type ProcessQueue<T> = (data: QueueItem<T>[]) => Promise<number[]>;

export type Find<T, R = unknown> = (
  callback: (item: QueueItem<T>) => boolean
) => Promise<R | null>;

export type FindMany<T, R = unknown> = (
  callback: (item: QueueItem<T>) => boolean
) => Promise<R[]>;

const getError = (e: unknown) => {
  if (e instanceof Error) {
    return [
      'Name: ' + e.name,
      'Message: ' + e.message,
      'Stack: ' + e.stack,
      'Cause: ' + (e.cause ? String(e.cause) : ''),
    ].join('\n');
  }
  return 'Unknown error';
};

export abstract class RedisBuffer<T> {
  // constructor
  public prefix = 'op:buffer';
  public table: string;
  public batchSize?: number;
  public redis: Redis;

  // abstract methods
  public abstract onInsert?: OnInsert<T>;
  public abstract onCompleted?: OnCompleted<T>;
  public abstract processQueue: ProcessQueue<T>;
  public abstract find: Find<T, unknown>;
  public abstract findMany: FindMany<T, unknown>;

  constructor(options: { table: string; redis: Redis; batchSize?: number }) {
    this.table = options.table;
    this.redis = options.redis;
    this.batchSize = options.batchSize;
  }

  public getKey(name?: string) {
    const key = this.prefix + ':' + this.table;
    if (name) {
      return `${key}:${name}`;
    }
    return key;
  }

  public async insert(value: T) {
    this.onInsert?.(value);
    await this.redis.rpush(this.getKey(), JSON.stringify(value));

    const length = await this.redis.llen(this.getKey());
    if (this.batchSize && length >= this.batchSize) {
      this.flush();
    }
  }

  public async flush() {
    try {
      const queue = await this.getQueue(this.batchSize || -1);

      if (queue.length === 0) {
        return {
          count: 0,
          data: [],
        };
      }

      try {
        const indexes = await this.processQueue(queue);
        await this.deleteIndexes(indexes);
        const data = indexes
          .map((index) => queue[index]?.event)
          .filter((event): event is T => event !== null);

        if (this.onCompleted) {
          const res = await this.onCompleted(data);
          return {
            count: res.length,
            data: res,
          };
        }

        return {
          count: indexes.length,
          data: indexes,
        };
      } catch (e) {
        console.log(
          `[${this.getKey()}] Failed to processQueue while flushing:`,
          e
        );
        const timestamp = new Date().getTime();
        await this.redis.hset(this.getKey(`failed:${timestamp}`), {
          error: getError(e),
          data: JSON.stringify(queue.map((item) => item.event)),
          retries: 0,
        });
      }
    } catch (e) {
      console.log(`[${this.getKey()}] Failed to getQueue while flushing:`, e);
    }
  }

  public async deleteIndexes(indexes: number[]) {
    const multi = this.redis.multi();
    indexes.forEach((index) => {
      multi.lset(this.getKey(), index, DELETE);
    });
    multi.lrem(this.getKey(), 0, DELETE);
    await multi.exec();
  }

  public async getQueue(limit: number): Promise<QueueItem<T>[]> {
    const queue = await this.redis.lrange(this.getKey(), 0, limit);
    return queue
      .map((item, index) => ({
        event: this.transformQueueItem(item),
        index,
      }))
      .filter((item): item is QueueItem<T> => item.event !== null);
  }

  private transformQueueItem(item: string): T | null {
    try {
      return JSON.parse(item);
    } catch (e) {
      return null;
    }
  }
}
