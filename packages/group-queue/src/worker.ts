import { performance } from 'node:perf_hooks';
import type Redis from 'ioredis';
import { Queue, type ReservedJob } from './queue';

export type BackoffStrategy = (attempt: number) => number; // ms

// Typed event system for Worker
export interface WorkerEvents<T = any>
  extends Record<string, (...args: any[]) => void> {
  error: (error: Error) => void;
  closed: () => void;
  ready: () => void;
  failed: (job: FailedJobEvent<T>) => void;
  completed: (job: CompletedJobEvent<T>) => void;
  'ioredis:close': () => void;
}

export interface FailedJobEvent<T = any> {
  id: string;
  groupId: string;
  payload: T;
  failedReason: string;
  attempts: number;
  maxAttempts: number;
  processedOn?: number;
  finishedOn?: number;
  data: T;
  opts: {
    attempts: number;
  };
}

export interface CompletedJobEvent<T = any> {
  id: string;
  groupId: string;
  payload: T;
  attempts: number;
  maxAttempts: number;
  processedOn?: number;
  finishedOn?: number;
  data: T;
  opts: {
    attempts: number;
  };
}

class TypedEventEmitter<
  TEvents extends Record<string, (...args: any[]) => void>,
> {
  private listeners = new Map<keyof TEvents, Array<TEvents[keyof TEvents]>>();

  on<K extends keyof TEvents>(event: K, listener: TEvents[K]): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
    return this;
  }

  off<K extends keyof TEvents>(event: K, listener: TEvents[K]): this {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index !== -1) {
        eventListeners.splice(index, 1);
      }
    }
    return this;
  }

  emit<K extends keyof TEvents>(
    event: K,
    ...args: Parameters<TEvents[K]>
  ): boolean {
    const eventListeners = this.listeners.get(event);
    if (eventListeners && eventListeners.length > 0) {
      for (const listener of eventListeners) {
        try {
          listener(...args);
        } catch (error) {
          // Don't let listener errors break the emit
          console.error(
            `Error in event listener for '${String(event)}':`,
            error,
          );
        }
      }
      return true;
    }
    return false;
  }

  removeAllListeners<K extends keyof TEvents>(event?: K): this {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
    return this;
  }
}

export type WorkerOptions<T> = {
  redis: Redis;
  namespace: string; // Required namespace for the queue (will be prefixed with 'groupmq:')
  name?: string; // Worker name for logging and identification
  handler: (job: ReservedJob<T>) => Promise<void>;
  jobTimeoutMs?: number; // How long a job can be processed before timing out (default: 30s)
  heartbeatMs?: number; // How often to send heartbeats (default: jobTimeoutMs/3)
  onError?: (err: unknown, job?: ReservedJob<T>) => void;
  maxAttempts?: number; // Maximum retry attempts per job (default: 3)
  backoff?: BackoffStrategy; // Retry backoff strategy
  enableCleanup?: boolean; // Whether to run periodic cleanup (default: true)
  cleanupIntervalMs?: number; // How often to run cleanup (default: 60s)
  blockingTimeoutSec?: number; // Timeout for blocking operations (default: 5s)
  orderingDelayMs?: number; // Delay before processing jobs to allow late events (default: 0)
};

const defaultBackoff: BackoffStrategy = (attempt) => {
  const base = Math.min(30_000, 2 ** (attempt - 1) * 500);
  const jitter = Math.floor(base * 0.25 * Math.random());
  return base + jitter;
};

export class Worker<T = any> extends TypedEventEmitter<WorkerEvents<T>> {
  public readonly name: string;
  private q: Queue;
  private handler: WorkerOptions<T>['handler'];
  private hbMs: number;
  private onError?: WorkerOptions<T>['onError'];
  private stopping = false;
  private ready = false;
  private closed = false;
  private maxAttempts: number;
  private backoff: BackoffStrategy;
  private enableCleanup: boolean;
  private cleanupMs: number;
  private cleanupTimer?: NodeJS.Timeout;
  private blockingTimeoutSec: number;
  private currentJob: ReservedJob<T> | null = null;
  private processingStartTime = 0;

  constructor(opts: WorkerOptions<T>) {
    super();

    if (!opts.handler || typeof opts.handler !== 'function') {
      throw new Error('Worker handler must be a function');
    }

    this.name =
      opts.name ?? `worker-${Math.random().toString(36).substr(2, 9)}`;

    // Create queue with the same namespace and job timeout
    const jobTimeoutMs = opts.jobTimeoutMs ?? 30_000;
    this.q = new Queue({
      redis: opts.redis,
      namespace: opts.namespace,
      jobTimeoutMs,
      orderingDelayMs: opts.orderingDelayMs,
    });

    this.handler = opts.handler;
    this.hbMs =
      opts.heartbeatMs ?? Math.max(1000, Math.floor(jobTimeoutMs / 3));
    this.onError = opts.onError;
    this.maxAttempts = opts.maxAttempts ?? 3;
    this.backoff = opts.backoff ?? defaultBackoff;
    this.enableCleanup = opts.enableCleanup ?? true;
    this.cleanupMs = opts.cleanupIntervalMs ?? 60_000; // cleanup every minute by default
    this.blockingTimeoutSec = opts.blockingTimeoutSec ?? 5; // 5 second timeout

    // Set up Redis connection event handlers
    this.setupRedisEventHandlers();
  }

  private setupRedisEventHandlers() {
    // Get Redis instance from the queue to monitor connection events
    const redis = (this.q as any).r; // Access private redis property
    if (redis) {
      redis.on('close', () => {
        this.closed = true;
        this.ready = false;
        this.emit('ioredis:close');
      });

      redis.on('error', (error: Error) => {
        this.emit('error', error);
      });

      redis.on('ready', () => {
        if (!this.ready && !this.closed) {
          this.ready = true;
          this.emit('ready');
        }
      });
    }
  }

  async run() {
    // Start cleanup timer if enabled
    if (this.enableCleanup) {
      this.cleanupTimer = setInterval(async () => {
        try {
          await this.q.cleanup();
        } catch (err) {
          this.onError?.(err);
        }
      }, this.cleanupMs);
    }

    while (!this.stopping) {
      // Always use blocking reserve for better efficiency
      const job = await this.q.reserveBlocking(this.blockingTimeoutSec);

      // If blocking timed out (no job), try to recover delayed groups
      if (!job) {
        try {
          await this.q.recoverDelayedGroups();
        } catch (err) {
          // Ignore recovery errors to avoid breaking the worker
        }
      } else {
        await this.processOne(job).catch((err) => {
          console.error('processOne fatal', err);
        });
      }
    }
  }

  /**
   * Stop the worker gracefully
   * @param gracefulTimeoutMs Maximum time to wait for current job to finish (default: 30 seconds)
   */
  async close(gracefulTimeoutMs = 30_000): Promise<void> {
    this.stopping = true;

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Wait for current job to finish or timeout
    const startTime = Date.now();
    while (this.currentJob && Date.now() - startTime < gracefulTimeoutMs) {
      await sleep(100);
    }

    if (this.currentJob) {
      console.warn(
        `Worker stopped with job still processing after ${gracefulTimeoutMs}ms timeout. Job ID: ${this.currentJob.id}`,
      );
    }

    // Clear tracking
    this.currentJob = null;
    this.processingStartTime = 0;
    this.ready = false;
    this.closed = true;

    // Emit closed event
    this.emit('closed');
  }

  /**
   * Get information about the currently processing job, if any
   */
  getCurrentJob(): { job: ReservedJob<T>; processingTimeMs: number } | null {
    if (!this.currentJob) {
      return null;
    }

    return {
      job: this.currentJob,
      processingTimeMs: performance.now() - this.processingStartTime,
    };
  }

  /**
   * Check if the worker is currently processing a job
   */
  isProcessing(): boolean {
    return this.currentJob !== null;
  }

  private async processOne(job: ReservedJob<T>) {
    // Track current job
    this.currentJob = job;
    this.processingStartTime = performance.now();

    let hbTimer: NodeJS.Timeout | undefined;
    const startHeartbeat = () => {
      hbTimer = setInterval(async () => {
        try {
          await this.q.heartbeat(job);
        } catch (e) {
          this.onError?.(e, job);
          this.emit('error', e instanceof Error ? e : new Error(String(e)));
        }
      }, this.hbMs);
    };

    try {
      startHeartbeat();
      await this.handler(job);
      clearInterval(hbTimer!);
      await this.q.complete(job);

      // Create a job-like object with accurate timing in milliseconds
      const finishedAt = performance.now();
      const completedJob = {
        ...job,
        processedOn: this.processingStartTime,
        finishedOn: finishedAt,
        data: job.payload,
        opts: {
          attempts: job.maxAttempts,
        },
      };

      this.emit('completed', completedJob);
    } catch (err) {
      clearInterval(hbTimer!);
      this.onError?.(err, job);

      // Safely emit error event - don't let emit errors break retry logic
      try {
        this.emit('error', err instanceof Error ? err : new Error(String(err)));
      } catch (emitError) {
        // Silently ignore emit errors to prevent breaking retry logic
      }

      // Create a job-like object with accurate timing in milliseconds for failed event
      const failedAt = performance.now();
      const failedJob = {
        ...job,
        failedReason: err instanceof Error ? err.message : String(err),
        processedOn: this.processingStartTime,
        finishedOn: failedAt,
        data: job.payload,
        opts: {
          attempts: job.maxAttempts,
        },
      };

      this.emit('failed', failedJob);

      // enforce attempts at worker level too (job-level enforced by Redis)
      const nextAttempt = job.attempts + 1; // after qRetry increment this becomes current
      const backoffMs = this.backoff(nextAttempt);

      if (nextAttempt >= this.maxAttempts) {
        await this.q.retry(job.id, 0); // will DLQ according to job.maxAttempts
        return;
      }

      await this.q.retry(job.id, backoffMs);
    } finally {
      // Clear current job tracking
      this.currentJob = null;
      this.processingStartTime = 0;
    }
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
