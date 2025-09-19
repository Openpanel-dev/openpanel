import { EventEmitter } from 'node:events';
import type Redis from 'ioredis';
import { Queue, type ReservedJob } from './queue';

export type BackoffStrategy = (attempt: number) => number; // ms

export type WorkerOptions<T> = {
  redis: Redis;
  namespace?: string;
  handler: (job: ReservedJob<T>) => Promise<void>;
  visibilityTimeoutMs?: number;
  heartbeatMs?: number;
  pollIntervalMs?: number;
  stopSignal?: AbortSignal;
  onError?: (err: unknown, job?: ReservedJob<T>) => void;
  maxAttempts?: number; // optional per-worker cap
  backoff?: BackoffStrategy; // retry backoff strategy
  enableCleanup?: boolean; // whether to run periodic cleanup
  cleanupIntervalMs?: number; // how often to run cleanup
  useBlocking?: boolean; // whether to use blocking reserve (default: true)
  blockingTimeoutSec?: number; // timeout for blocking operations
  orderingDelayMs?: number; // delay before processing jobs to allow late events
};

const defaultBackoff: BackoffStrategy = (attempt) => {
  const base = Math.min(30_000, 2 ** (attempt - 1) * 500);
  const jitter = Math.floor(base * 0.25 * Math.random());
  return base + jitter;
};

// Types for BullMQ compatibility
type BullMQJob = {
  id: string;
  data: any;
  opts: {
    attempts: number;
    delay: number;
  };
  attempts: number;
  processedOn?: number;
  finishedOn?: number;
  failedReason?: string;
};

export class Worker<T = any> extends EventEmitter {
  private q: Queue;
  private handler: WorkerOptions<T>['handler'];
  private hbMs: number;
  private pollMs: number;
  private onError?: WorkerOptions<T>['onError'];
  private stopping = false;
  private stopSignal?: AbortSignal;
  private maxAttempts: number;
  private backoff: BackoffStrategy;
  private enableCleanup: boolean;
  private cleanupMs: number;
  private cleanupTimer?: NodeJS.Timeout;
  private useBlocking: boolean;
  private blockingTimeoutSec: number;
  private currentJob: ReservedJob<T> | null = null;
  private processingStartTime = 0;
  public readonly name: string;

  // BullMQ-compatible event listener overloads
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'ready', listener: () => void): this;
  on(event: 'closed', listener: () => void): this;
  on(event: 'failed', listener: (job?: BullMQJob) => void): this;
  on(event: 'completed', listener: (job?: BullMQJob) => void): this;
  on(event: 'ioredis:close', listener: () => void): this;
  on(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  constructor(opts: WorkerOptions<T>) {
    super();

    if (!opts.handler || typeof opts.handler !== 'function') {
      throw new Error('Worker handler must be a function');
    }

    this.q = new Queue({
      redis: opts.redis,
      namespace: opts.namespace,
      visibilityTimeoutMs: opts.visibilityTimeoutMs,
      orderingDelayMs: opts.orderingDelayMs,
    });
    this.name = opts.namespace || 'group-worker';
    this.handler = opts.handler;
    const vt = opts.visibilityTimeoutMs ?? 30_000;
    this.hbMs = opts.heartbeatMs ?? Math.max(1000, Math.floor(vt / 3));
    this.pollMs = opts.pollIntervalMs ?? 100;
    this.onError = opts.onError;
    this.stopSignal = opts.stopSignal;
    this.maxAttempts = opts.maxAttempts ?? 3;
    this.backoff = opts.backoff ?? defaultBackoff;
    this.enableCleanup = opts.enableCleanup ?? true;
    this.cleanupMs = opts.cleanupIntervalMs ?? 60_000; // cleanup every minute by default
    this.useBlocking = opts.useBlocking ?? true; // use blocking by default
    this.blockingTimeoutSec = opts.blockingTimeoutSec ?? 5; // 5 second timeout

    // Listen for Redis connection events
    opts.redis.on('close', () => {
      this.emit('ioredis:close');
    });

    if (this.stopSignal) {
      this.stopSignal.addEventListener('abort', () => {
        this.stopping = true;
      });
    }
  }

  async run() {
    // Emit ready event
    this.emit('ready');

    // Start cleanup timer if enabled
    if (this.enableCleanup) {
      this.cleanupTimer = setInterval(async () => {
        try {
          await this.q.cleanup();
        } catch (err) {
          this.onError?.(err);
          this.emit('error', err);
        }
      }, this.cleanupMs);
    }

    while (!this.stopping) {
      let job: ReservedJob<T> | null = null;

      if (this.useBlocking) {
        // Use blocking reserve for better efficiency
        job = await this.q.reserveBlocking(this.blockingTimeoutSec);
      } else {
        // Fall back to polling mode
        job = await this.q.reserve();
        if (!job) {
          await sleep(this.pollMs);
          continue;
        }
      }

      if (job) {
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
  async stop(gracefulTimeoutMs = 30_000): Promise<void> {
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

    // Emit closed event
    this.emit('closed');
  }

  /**
   * Close the worker (alias for stop for BullMQ compatibility)
   */
  async close(): Promise<void> {
    await this.stop();
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
      processingTimeMs: Date.now() - this.processingStartTime,
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
    this.processingStartTime = Date.now();

    // Create BullMQ-compatible job object for events
    const eventJob = this.createBullMQCompatibleJob(job);

    let hbTimer: NodeJS.Timeout | undefined;
    const startHeartbeat = () => {
      hbTimer = setInterval(async () => {
        try {
          await this.q.heartbeat(job);
        } catch (e) {
          this.onError?.(e, job);
          this.emit('error', e);
        }
      }, this.hbMs);
    };

    try {
      startHeartbeat();
      await this.handler(job);
      clearInterval(hbTimer!);
      await this.q.complete(job);

      // Emit completed event with BullMQ-compatible job
      this.emit('completed', eventJob);
    } catch (err) {
      clearInterval(hbTimer!);
      this.onError?.(err, job);
      this.emit('error', err);

      // Update job with failure reason for failed event
      const failedJob = {
        ...eventJob,
        failedReason: err instanceof Error ? err.message : String(err),
      };
      this.emit('failed', failedJob);

      // enforce attempts at worker level too (job-level enforced by Redis)
      const nextAttempt = job.attempts + 1; // after qRetry increment this becomes current
      const backoffMs = this.backoff(nextAttempt);

      if (job.attempts >= this.maxAttempts) {
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

  /**
   * Create a BullMQ-compatible job object for event emissions
   */
  private createBullMQCompatibleJob(job: ReservedJob<T>): BullMQJob {
    const processedOn = this.processingStartTime;
    const finishedOn = Date.now();

    return {
      id: job.id,
      data: job.payload,
      opts: {
        attempts: job.maxAttempts,
        delay: 0,
      },
      attempts: job.attempts,
      processedOn,
      finishedOn,
      failedReason: undefined,
    };
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
