import { Readable } from 'node:stream';
import type { ClickHouseSettings } from '@clickhouse/client';
import { generateSecureId } from '@openpanel/common/server';
import { type ILogger, createLogger } from '@openpanel/logger';
import { cronQueue } from '@openpanel/queue';
import { type ExtendedRedis, getRedisCache, runEvery } from '@openpanel/redis';

export type FlushPhaseTimings = {
  lrangeMs?: number;
  chFetchMs?: number;
  chInsertMs?: number;
  trimMs?: number;
  onFlushMs?: number;
};

export type FlushTrigger = 'add' | 'cron';

export type FlushObservation = {
  buffer: string;
  result: 'success' | 'error' | 'locked' | 'paused';
  trigger: FlushTrigger;
  totalMs: number;
  rowsProcessed?: number;
  llenAtStart?: number;
  phases?: FlushPhaseTimings;
  err?: unknown;
};

export type FlushObserver = (obs: FlushObservation) => void;

export type AddObservation = {
  buffer: string;
  durationMs: number;
  skipped?: boolean;
  skipReason?: string;
};

export type AddObserver = (obs: AddObservation) => void;

export class BaseBuffer {
  name: string;
  logger: ILogger;
  lockKey: string;
  lockTimeout = 60;
  onFlush: () => Promise<void>;
  enableParallelProcessing: boolean;

  /** Optional hook used by the worker to bridge flushes into Prometheus. */
  public flushObserver: FlushObserver | null = null;

  /** Optional hook for instrumenting add() latency. */
  public addObserver: AddObserver | null = null;

  private inflightStats: {
    rowsProcessed?: number;
    phases?: FlushPhaseTimings;
  } = {};

  private inflightAddStats: {
    skipped?: boolean;
    skipReason?: string;
  } = {};

  // Kept for backward compatibility — existing buffers rely on this.redis
  protected bufferCounterKey: string;
  protected redis: ExtendedRedis;

  /**
   * Max number of ch.insert sub-chunks that a single flush may run in parallel.
   */
  protected chInsertConcurrency = process.env.BUFFER_CH_INSERT_CONCURRENCY
    ? Math.max(
        1,
        Number.parseInt(process.env.BUFFER_CH_INSERT_CONCURRENCY, 10),
      )
    : 5;

  constructor(options: {
    name: string;
    onFlush: () => Promise<void>;
    enableParallelProcessing?: boolean;
    redis?: ExtendedRedis;
  }) {
    this.logger = createLogger({ name: options.name });
    this.name = options.name;
    this.lockKey = `lock:${this.name}`;
    this.onFlush = options.onFlush;
    this.bufferCounterKey = `${this.name}:buffer:count`;
    this.enableParallelProcessing = options.enableParallelProcessing ?? false;
    this.redis = options.redis ?? getRedisCache();
  }

  protected getClickhouseSettings(): ClickHouseSettings {
    if (process.env.BUFFER_ASYNC_INSERTS) {
      return {
        async_insert: 1,
        wait_for_async_insert: 0,
        parallel_view_processing: 1,
      };
    }
    return {};
  }

  /**
   * Wrap already-serialized JSONEachRow lines into an object-mode Readable
   * stream. Lets CH inserts skip JSON.parse × N on the worker side — the raw
   * bytes go from Redis to CH's HTTP body unchanged.
   */
  protected jsonEachRowStream(lines: string[]): Readable {
    return Readable.from(
      (function* () {
        for (const line of lines) {
          yield line;
        }
      })(),
    );
  }

  protected chunks<T>(items: T[], size: number) {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Run fn over items with bounded concurrency. Preserves result order.
   */
  protected async parallelLimit<T, R>(
    items: T[],
    fn: (item: T, index: number) => Promise<R>,
    concurrency: number = this.chInsertConcurrency,
  ): Promise<R[]> {
    if (items.length === 0) return [];
    if (concurrency <= 1 || items.length === 1) {
      const out: R[] = [];
      for (let i = 0; i < items.length; i++) {
        out.push(await fn(items[i] as T, i));
      }
      return out;
    }
    const results = new Array<R>(items.length);
    let nextIndex = 0;
    const worker = async (): Promise<void> => {
      while (true) {
        const idx = nextIndex++;
        if (idx >= items.length) return;
        results[idx] = await fn(items[idx] as T, idx);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(concurrency, items.length) }, () =>
        worker(),
      ),
    );
    return results;
  }

  /** Subclasses call this from onFlush to record processed row counts/timings. */
  protected reportFlushStats(stats: {
    rowsProcessed?: number;
    phases?: FlushPhaseTimings;
  }) {
    if (stats.rowsProcessed !== undefined) {
      this.inflightStats.rowsProcessed = stats.rowsProcessed;
    }
    if (stats.phases) {
      this.inflightStats.phases = {
        ...(this.inflightStats.phases ?? {}),
        ...stats.phases,
      };
    }
  }

  /** Time the body of an add() call and report via addObserver. */
  protected async timeAdd<T>(fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    this.inflightAddStats = {};
    try {
      return await fn();
    } finally {
      try {
        this.addObserver?.({
          buffer: this.name,
          durationMs: performance.now() - start,
          skipped: this.inflightAddStats.skipped,
          skipReason: this.inflightAddStats.skipReason,
        });
      } catch {
        // observer errors must not break add
      }
    }
  }

  /** Mark the in-flight add() as a no-op for observability. */
  protected reportAddSkipped(reason: string) {
    this.inflightAddStats.skipped = true;
    this.inflightAddStats.skipReason = reason;
  }

  /**
   * Utility method to safely get buffer size with counter fallback.
   * Kept for backward compatibility with existing buffers.
   */
  protected async getBufferSizeWithCounter(
    fallbackFn: () => Promise<number>,
  ): Promise<number> {
    const key = this.bufferCounterKey;
    try {
      await runEvery({
        interval: 60 * 60,
        key: `${this.name}-buffer:resync`,
        fn: async () => {
          try {
            const actual = await fallbackFn();
            await this.redis.set(this.bufferCounterKey, actual.toString());
          } catch (error) {
            this.logger.warn('Failed to resync buffer counter', { error });
          }
        },
      }).catch(() => {});

      const counterValue = await this.redis.get(key);
      if (counterValue !== null) {
        const parsed = Number.parseInt(counterValue, 10);
        if (!Number.isNaN(parsed)) {
          return Math.max(0, parsed);
        }
        this.logger.warn('Invalid buffer counter value, reinitializing', {
          key,
          counterValue,
        });
      }

      const count = await fallbackFn();
      await this.redis.set(key, count.toString());
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
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await this.redis.eval(script, 1, this.lockKey, lockId);
  }

  private emitFlushObservation(obs: FlushObservation): void {
    try {
      this.flushObserver?.(obs);
    } catch (error) {
      this.logger.warn('flushObserver threw', { err: error });
    }

    const logPayload = {
      buffer: obs.buffer,
      result: obs.result,
      trigger: obs.trigger,
      totalMs: Math.round(obs.totalMs),
      rowsProcessed: obs.rowsProcessed,
      llenAtStart: obs.llenAtStart,
      lrangeMs:
        obs.phases?.lrangeMs != null
          ? Math.round(obs.phases.lrangeMs)
          : undefined,
      chInsertMs:
        obs.phases?.chInsertMs != null
          ? Math.round(obs.phases.chInsertMs)
          : undefined,
      trimMs:
        obs.phases?.trimMs != null ? Math.round(obs.phases.trimMs) : undefined,
      onFlushMs:
        obs.phases?.onFlushMs != null
          ? Math.round(obs.phases.onFlushMs)
          : undefined,
    };

    if (obs.result === 'error') {
      this.logger.error(`Flush failed for ${this.name}`, { ...logPayload, err: obs.err });
    } else if (obs.result === 'paused') {
      this.logger.debug(`Flush skipped for ${this.name} (cron paused)`, logPayload);
    } else if (obs.result === 'locked') {
      this.logger.debug(`Flush skipped for ${this.name} (locked)`, logPayload);
    } else {
      this.logger.info(`Flush completed for ${this.name}`, logPayload);
    }
  }

  async tryFlush(options: { trigger?: FlushTrigger } = {}) {
    const trigger: FlushTrigger = options.trigger ?? 'cron';
    const startedAt = performance.now();
    this.inflightStats = {};

    const isCronQueuePaused = await cronQueue.isPaused();
    if (isCronQueuePaused) {
      this.logger.info('Cron queue is paused, skipping flush');
      this.emitFlushObservation({
        buffer: this.name,
        result: 'paused',
        trigger,
        totalMs: performance.now() - startedAt,
      });
      return;
    }

    if (this.enableParallelProcessing) {
      const onFlushStarted = performance.now();
      try {
        await this.onFlush();
        this.emitFlushObservation({
          buffer: this.name,
          result: 'success',
          trigger,
          totalMs: performance.now() - startedAt,
          rowsProcessed: this.inflightStats.rowsProcessed,
          phases: {
            ...this.inflightStats.phases,
            onFlushMs: performance.now() - onFlushStarted,
          },
        });
      } catch (error) {
        this.emitFlushObservation({
          buffer: this.name,
          result: 'error',
          trigger,
          totalMs: performance.now() - startedAt,
          rowsProcessed: this.inflightStats.rowsProcessed,
          phases: {
            ...this.inflightStats.phases,
            onFlushMs: performance.now() - onFlushStarted,
          },
          err: error,
        });
      }
      return;
    }

    const lockId = generateSecureId('lock');
    const acquired = await this.redis.set(
      this.lockKey,
      lockId,
      'EX',
      this.lockTimeout,
      'NX',
    );

    if (acquired !== 'OK') {
      this.emitFlushObservation({
        buffer: this.name,
        result: 'locked',
        trigger,
        totalMs: performance.now() - startedAt,
      });
      return;
    }

    const onFlushStarted = performance.now();
    try {
      await this.onFlush();
      this.emitFlushObservation({
        buffer: this.name,
        result: 'success',
        trigger,
        totalMs: performance.now() - startedAt,
        rowsProcessed: this.inflightStats.rowsProcessed,
        phases: {
          ...this.inflightStats.phases,
          onFlushMs: performance.now() - onFlushStarted,
        },
      });
    } catch (error) {
      this.emitFlushObservation({
        buffer: this.name,
        result: 'error',
        trigger,
        totalMs: performance.now() - startedAt,
        rowsProcessed: this.inflightStats.rowsProcessed,
        phases: {
          ...this.inflightStats.phases,
          onFlushMs: performance.now() - onFlushStarted,
        },
        err: error,
      });
      if (this.bufferCounterKey) {
        this.logger.warn('Resetting buffer counter due to flush error');
        await this.redis.del(this.bufferCounterKey);
      }
    } finally {
      await this.releaseLock(lockId);
    }
  }
}
