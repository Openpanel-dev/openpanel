import type { z } from 'zod';
import type { JobCtx } from '../context';

/**
 * What a caller may set on a single enqueue.
 *
 * Deliberately narrower than BullMQ's `JobsOptions`: this type hangs off `Ctx`
 * and so lands in the type graph a frontend's `tsc` walks to resolve
 * `AppRouter`. Widen it by adding the field you need; never by re-exporting
 * BullMQ's.
 */
export interface EnqueueOptions {
  /** Milliseconds to hold the job before a worker may take it. */
  delay?: number;
  priority?: number;
  attempts?: number;
  backoff?: JobBackoff;
  /**
   * BullMQ short-circuits `add` while ANY record for this id exists, which is
   * why it is not a general idempotency key — paired with a retention `age` it
   * deadlocks (see `deduplicationId`). `sessions` and `insights` use it because
   * their records are trimmed by count.
   */
  jobId?: string;
  /**
   * Collapses repeat enqueues while a job holding this key is unfinished.
   *
   * Released by `moveToFinished` on completion and on terminal failure, so a
   * later replay enqueues normally. `cohortCompute` must keep this rather than
   * be normalised onto `jobId`.
   */
  deduplicationId?: string;
}

export interface JobBackoff {
  type: 'fixed' | 'exponential';
  /** Milliseconds; the base that `exponential` doubles from. */
  delay: number;
}

/** `age` in seconds, `count` in jobs. `age` alone only trims when another job finishes. */
export type JobRetention = { count: number } | { age: number; count?: number };

/** Applied to every job on a queue unless a single enqueue overrides it. */
export interface QueueDefaults {
  attempts?: number;
  backoff?: JobBackoff;
  /** `true` drops it immediately, a number keeps the last N. Redis memory is finite. */
  removeOnComplete?: number | boolean | JobRetention;
  removeOnFail?: number | boolean | JobRetention;
}

export interface WorkerSettings {
  /** Jobs this queue's worker runs at once, per process. */
  concurrency?: number;
  /**
   * Ceiling on jobs *started* per window, shared by every worker on the queue.
   * This is the knob for a third party's rate limit; `concurrency` is the knob
   * for our own CPU.
   */
  limiter?: { max: number; duration: number };
}

export interface JobDefinition<TPayload extends z.ZodType> {
  /**
   * Must survive a JSON round-trip: BullMQ stores job data as JSON, so a
   * `z.date()` comes back out as a string and fails its own schema. Use
   * `z.iso.datetime()` for times, and ids rather than objects for entities.
   */
  payload: TPayload;
  handler: (args: {
    payload: z.output<TPayload>;
    ctx: JobCtx;
  }) => Promise<void>;
  /** Defaults for this job alone, over the queue's. */
  options?: EnqueueOptions;
}

/**
 * A job with its payload type erased, for the machinery that handles all of
 * them. `never` as the handler's parameter is what makes every concrete
 * handler assignable to it.
 */
export interface AnyJob {
  payload: z.ZodType;
  handler: (args: never) => Promise<void>;
  options?: EnqueueOptions;
}

/** Stamped on by `defineQueue`, so a job value alone is enough to enqueue it. */
export interface JobBinding {
  readonly queue: string;
  readonly name: string;
}

export type AnyBoundJob = AnyJob & JobBinding;

/** What an enqueuer passes: the schema's *input*, before any transform it declares. */
export type PayloadOf<TJob> = TJob extends { payload: infer TSchema }
  ? TSchema extends z.ZodType
    ? z.input<TSchema>
    : never
  : never;

/**
 * Translates one V1 job's raw data into the (job name, payload) pair V2 speaks.
 *
 * Returns `undefined` for a shape it does not recognise, which `resolveJob`
 * turns into a throw. The BullMQ job *name* on the wire is not authoritative —
 * V1 dispatched on `data.type`, and `sessions` is named `'session'` while its
 * type is `'createSessionEnd'` — so the hook decides the name too.
 */
export type CompatHook = (
  data: unknown
) => { job: string; payload: unknown } | undefined;

export interface QueueDefinition<
  TJobs extends Record<string, AnyJob> = Record<string, AnyJob>,
> {
  name: string;
  defaults?: QueueDefaults;
  worker?: WorkerSettings;
  /** Deletable once no legacy-shaped job can still be replayed — see ADR-005 risk 1. */
  compat?: CompatHook;
  jobs: { [K in keyof TJobs]: TJobs[K] & JobBinding };
}

export type QueueMap = Record<string, QueueDefinition>;

/** The typed enqueue surface derived from the registry — `queues.import.import.add(...)`. */
export type Producers<TQueues extends QueueMap> = {
  [Q in keyof TQueues]: {
    [J in keyof TQueues[Q]['jobs']]: {
      add(
        payload: PayloadOf<TQueues[Q]['jobs'][J]>,
        options?: EnqueueOptions
      ): Promise<string>;
      /** Job ids are queue-scoped, not job-scoped: this removes from the whole queue. */
      remove(jobId: string): Promise<void>;
    };
  };
};

export function defineJob<TPayload extends z.ZodType>(
  definition: JobDefinition<TPayload>
): JobDefinition<TPayload> {
  return definition;
}

/**
 * Declares a queue and the jobs on it. Constructs nothing: no Redis connection
 * exists until `createProducers` or `startWorkers` is handed the registry,
 * which is what keeps importing a module free of side effects and lets one
 * declaration serve a producer-only process and a worker one.
 */
export function defineQueue<TJobs extends Record<string, AnyJob>>(
  name: string,
  config: {
    defaults?: QueueDefaults;
    worker?: WorkerSettings;
    compat?: CompatHook;
    jobs: TJobs;
  }
): QueueDefinition<TJobs> {
  const jobs = Object.fromEntries(
    Object.entries(config.jobs).map(([jobName, job]) => [
      jobName,
      { ...job, queue: name, name: jobName },
    ])
  ) as QueueDefinition<TJobs>['jobs'];

  return {
    name,
    defaults: config.defaults,
    worker: config.worker,
    compat: config.compat,
    jobs,
  };
}
