import { createLogger } from '@openpanel/logger';
import { getRedisCache } from '@openpanel/redis';

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
  public logger: ReturnType<typeof createLogger>;

  // abstract methods
  public abstract onInsert?: OnInsert<T>;
  public abstract onCompleted?: OnCompleted<T>;
  public abstract processQueue: ProcessQueue<T>;
  public abstract find: Find<T, unknown>;
  public abstract findMany: FindMany<T, unknown>;

  constructor(options: { table: string; batchSize?: number }) {
    this.table = options.table;
    this.batchSize = options.batchSize;
    this.logger = createLogger({ name: `buffer` }).child({
      table: this.table,
    });
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
    await getRedisCache().rpush(this.getKey(), JSON.stringify(value));

    const length = await getRedisCache().llen(this.getKey());
    this.logger.debug(
      `Inserted item into buffer ${this.table}. Current length: ${length}`
    );

    if (this.batchSize && length >= this.batchSize) {
      this.logger.info(
        `Buffer ${this.table} reached batch size (${this.batchSize}). Flushing...`
      );
      this.flush();
    }
  }

  public async flush() {
    try {
      const queue = await this.getQueue(this.batchSize || -1);

      if (queue.length === 0) {
        this.logger.debug(`Flush called on empty buffer ${this.table}`);
        return { count: 0, data: [] };
      }

      this.logger.info(
        `Flushing ${queue.length} items from buffer ${this.table}`
      );

      try {
        const indexes = await this.processQueue(queue);
        await this.deleteIndexes(indexes);
        const data = indexes
          .map((index) => queue[index]?.event)
          .filter((event): event is T => event !== null);

        if (this.onCompleted) {
          const res = await this.onCompleted(data);
          this.logger.info(
            `Completed processing ${res.length} items from buffer ${this.table}`
          );
          return { count: res.length, data: res };
        }

        this.logger.info(
          `Processed ${indexes.length} items from buffer ${this.table}`
        );
        return { count: indexes.length, data: indexes };
      } catch (e) {
        this.logger.error(
          `Failed to process queue while flushing buffer ${this.table}:`,
          e
        );
        const timestamp = new Date().getTime();
        await getRedisCache().hset(this.getKey(`failed:${timestamp}`), {
          error: getError(e),
          data: JSON.stringify(queue.map((item) => item.event)),
          retries: 0,
        });
        this.logger.warn(
          `Stored ${queue.length} failed items in ${this.getKey(`failed:${timestamp}`)}`
        );
      }
    } catch (e) {
      this.logger.error(
        `Failed to get queue while flushing buffer ${this.table}:`,
        e
      );
    }
  }

  public async deleteIndexes(indexes: number[]) {
    const multi = getRedisCache().multi();
    indexes.forEach((index) => {
      multi.lset(this.getKey(), index, DELETE);
    });
    multi.lrem(this.getKey(), 0, DELETE);
    await multi.exec();
    this.logger.debug(
      `Deleted ${indexes.length} items from buffer ${this.table}`
    );
  }

  public async getQueue(limit: number): Promise<QueueItem<T>[]> {
    const queue = await getRedisCache().lrange(this.getKey(), 0, limit);
    const result = queue
      .map((item, index) => ({
        event: this.transformQueueItem(item),
        index,
      }))
      .filter((item): item is QueueItem<T> => item.event !== null);
    this.logger.debug(
      `Retrieved ${result.length} items from buffer ${this.table}`
    );
    return result;
  }

  private transformQueueItem(item: string): T | null {
    try {
      return JSON.parse(item);
    } catch (e) {
      this.logger.warn(`Failed to parse item in buffer ${this.table}:`, e);
      return null;
    }
  }
}
