import { generateSecureId } from '@openpanel/common/server';
import { type ILogger, createLogger } from '@openpanel/logger';
import { cronQueue } from '@openpanel/queue';
import { getRedisCache } from '@openpanel/redis';

export type FlushPhaseTimings = {
  lrangeMs?: number;
  chInsertMs?: number;
  trimMs?: number;
  /** Total time spent inside onFlush (subclass-specific processing) */
  onFlushMs?: number;
};

export type FlushTrigger = 'add' | 'cron';

export type FlushObservation = {
  buffer: string;
  /**
   * - `success`: flush ran and completed without error
   * - `error`: flush ran and threw
   * - `locked`: another worker held the lock (no-op)
   * - `paused`: cron queue paused (no-op)
   */
  result: 'success' | 'error' | 'locked' | 'paused';
  /** What invoked this flush: `add` = fast-path (buffer crossed batchSize), `cron` = periodic scheduler. */
  trigger: FlushTrigger;
  /** Total wall time of the tryFlush call, including lock acquisition. */
  totalMs: number;
  /** Number of rows actually processed by this flush (subclass-reported). */
  rowsProcessed?: number;
  /** LLEN of the buffer's main list captured at flush start. */
  llenAtStart?: number;
  phases?: FlushPhaseTimings;
  err?: unknown;
};

export type FlushObserver = (obs: FlushObservation) => void;

export type AddObservation = {
  buffer: string;
  durationMs: number;
};

export type AddObserver = (obs: AddObservation) => void;

export class BaseBuffer {
  name: string;
  logger: ILogger;
  lockKey: string;
  lockTimeout = 60;
  onFlush: () => Promise<void> | void;
  enableParallelProcessing: boolean;

  /**
   * Subclass-reported counts/timings for the in-flight flush. Populated by
   * `reportFlushStats` from within `onFlush` so the base-class observer can
   * include them in the FlushObservation.
   */
  private inflightStats: {
    rowsProcessed?: number;
    phases?: FlushPhaseTimings;
  } = {};

  /** Optional hook used by the worker to bridge flushes into Prometheus. */
  public flushObserver: FlushObserver | null = null;

  /** Optional hook for instrumenting add() latency. */
  public addObserver: AddObserver | null = null;

  constructor(options: {
    name: string;
    onFlush: () => Promise<void>;
    enableParallelProcessing?: boolean;
  }) {
    this.logger = createLogger({ name: options.name });
    this.name = options.name;
    this.lockKey = `lock:${this.name}`;
    this.onFlush = options.onFlush;
    this.enableParallelProcessing = options.enableParallelProcessing ?? false;
  }

  /**
   * Returns the Redis key of the buffer's main list (the queue of pending
   * rows). Used by base-class methods for ground-truth size and
   * observability. Subclasses MUST override.
   */
  protected getRedisListKey(): string {
    throw new Error(
      `${this.name}: subclass must override getRedisListKey()`,
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
   * Subclasses call this from within onFlush to record what they actually
   * did. The base class includes these in the FlushObservation it emits.
   */
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

  /**
   * Ground-truth size of the buffer (LLEN of the Redis list). O(1). The
   * previous implementation kept a shadow counter to "avoid" LLEN — but
   * LLEN and GET are both O(1) single-roundtrip ops in Redis, so the
   * counter was free complexity that silently drifted (see incident
   * 2026-05-20). Always use this.
   */
  async getBufferSize(): Promise<number> {
    return await getRedisCache().llen(this.getRedisListKey());
  }

  /**
   * Time the body of an `add()` call. Subclasses wrap their work with this
   * so all add latency is reported uniformly via the `addObserver` hook.
   */
  protected async timeAdd<T>(fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      try {
        this.addObserver?.({
          buffer: this.name,
          durationMs: performance.now() - start,
        });
      } catch {
        // observer errors must not break add
      }
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
    await getRedisCache().eval(script, 1, this.lockKey, lockId);
  }

  /**
   * Emit a flush observation to the configured observer and to the structured
   * logger. Catches observer errors so a bad metrics path can never break
   * the worker.
   */
  private emitFlushObservation(obs: FlushObservation): void {
    try {
      this.flushObserver?.(obs);
    } catch (error) {
      this.logger.warn({ err: error }, 'flushObserver threw');
    }

    const logPayload = {
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
        obs.phases?.trimMs != null
          ? Math.round(obs.phases.trimMs)
          : undefined,
      onFlushMs:
        obs.phases?.onFlushMs != null
          ? Math.round(obs.phases.onFlushMs)
          : undefined,
    };

    if (obs.result === 'error') {
      this.logger.error({ ...logPayload, err: obs.err }, 'Buffer flush');
    } else if (obs.result === 'paused') {
      // Demoted to debug — happens every 10s when intentionally paused
      this.logger.debug(logPayload, 'Buffer flush skipped (cron paused)');
    } else {
      this.logger.info(logPayload, 'Buffer flush');
    }
  }

  async tryFlush(options: { trigger?: FlushTrigger } = {}) {
    const trigger: FlushTrigger = options.trigger ?? 'cron';
    const startedAt = performance.now();
    this.inflightStats = {};

    let llenAtStart: number | undefined;
    try {
      llenAtStart = await this.getBufferSize();
    } catch {
      // best-effort
    }

    const isCronQueuePaused = await cronQueue.isPaused();
    if (isCronQueuePaused) {
      this.emitFlushObservation({
        buffer: this.name,
        result: 'paused',
        trigger,
        totalMs: performance.now() - startedAt,
        llenAtStart,
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
          llenAtStart,
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
          llenAtStart,
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
    const acquired = await getRedisCache().set(
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
        llenAtStart,
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
        llenAtStart,
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
        llenAtStart,
        phases: {
          ...this.inflightStats.phases,
          onFlushMs: performance.now() - onFlushStarted,
        },
        err: error,
      });
    } finally {
      await this.releaseLock(lockId);
    }
  }
}
