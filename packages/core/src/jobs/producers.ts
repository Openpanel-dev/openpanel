import {
  Queue as BullQueue,
  type ConnectionOptions,
  type JobsOptions,
} from 'bullmq';
import type { Logger } from '../logger';
import type {
  AnyBoundJob,
  EnqueueOptions,
  Producers,
  QueueDefaults,
  QueueDefinition,
  QueueMap,
} from './define';
import { type JobMeta, wrap } from './envelope';
import { queueKey } from './naming';

export type EnqueueFn = (
  job: AnyBoundJob,
  payload: unknown,
  options?: EnqueueOptions,
  meta?: JobMeta
) => Promise<string>;

export type RemoveFn = (queue: string, jobId: string) => Promise<void>;

export interface ProducerHandle<TQueues extends QueueMap> {
  /** Enqueues with no request attached — a boot-time or scheduled enqueue. */
  queues: Producers<TQueues>;
  /** The same surface, stamping `meta` onto everything enqueued through it. */
  scope(meta: JobMeta): Producers<TQueues>;
  /** The untyped seam the worker runtime enqueues through. Prefer `queues`. */
  enqueue: EnqueueFn;
  remove: RemoveFn;
  /**
   * The live BullMQ queues, for the four call sites that speak BullMQ directly
   * rather than enqueueing: the buffers' `cronQueue.isPaused()`, import's
   * `getJob`, shutdown's `getActiveCount`, and bull-board. Nothing that
   * enqueues should reach for these: they take unvalidated data and no
   * metadata, which is the whole of what `queues` adds.
   */
  bullQueues: BullQueue[];
  close(): Promise<void>;
}

export interface CreateProducersOptions {
  /** Shared: producing never blocks, so one client serves every queue. */
  connection: ConnectionOptions;
  /** `QUEUE_CLUSTER`. Off in every deployment that exists today — see `queueKey`. */
  cluster?: boolean;
  namespace?: string;
  /**
   * Where a queue's connection errors go. BullMQ re-emits ioredis errors on
   * every `Queue`, and an `'error'` event with no listener is an uncaught
   * exception that kills the process — production lost the api roughly daily
   * to idle ECONNRESETs before a listener was added here.
   * A listener is attached either way; this decides whether it says anything.
   */
  logger?: Logger;
}

/**
 * Turns the registry into something that can enqueue.
 *
 * Every process needs this, including one that runs no workers — an RPC
 * procedure enqueues. The Redis client is the caller's to close; closing it
 * here would take down a connection the workers may still be using.
 */
export function createProducers<TQueues extends QueueMap>(
  definitions: TQueues,
  { connection, cluster, namespace, logger }: CreateProducersOptions
): ProducerHandle<TQueues> {
  const bullQueues = new Map<string, BullQueue>();

  for (const definition of Object.values(definitions)) {
    const queue = new BullQueue(
      queueKey(definition.name, { cluster, namespace }),
      {
        connection,
        defaultJobOptions: toJobsOptions(definition.defaults),
      }
    );

    // Never omitted: the listener is what stops a reconnectable socket error
    // from taking the process down. ioredis reconnects on its own.
    queue.on('error', (error) =>
      logger?.error(
        { err: error, queue: definition.name },
        'queue connection error'
      )
    );

    bullQueues.set(definition.name, queue);
  }

  const queueFor = (name: string): BullQueue => {
    const queue = bullQueues.get(name);
    if (!queue) {
      throw new Error(`Queue '${name}' is not in the registry`);
    }
    return queue;
  };

  const enqueue: EnqueueFn = async (job, payload, options, meta) => {
    // Validated here as well as in the worker, so a bad payload fails at the
    // call site — with that caller's stack — instead of surfacing later as a
    // failed job nobody is watching.
    const parsed = job.payload.parse(payload);

    const added = await queueFor(job.queue).add(
      job.name,
      wrap(parsed, meta ?? {}),
      toJobsOptions(undefined, { ...job.options, ...options })
    );

    if (!added.id) {
      throw new Error(
        `Enqueued '${job.queue}.${job.name}' but Redis returned no job id`
      );
    }
    return added.id;
  };

  const remove: RemoveFn = async (queue, jobId) => {
    await queueFor(queue).remove(jobId);
  };

  return {
    queues: buildProducers(definitions, enqueue, remove, {}),
    scope: (meta) => buildProducers(definitions, enqueue, remove, meta),
    enqueue,
    remove,
    bullQueues: [...bullQueues.values()],
    close: async () => {
      await Promise.all([...bullQueues.values()].map((queue) => queue.close()));
    },
  };
}

/** Shared with the test double in `jobs/testing.ts`, which swaps only the two seams. */
export function buildProducers<TQueues extends QueueMap>(
  definitions: TQueues,
  enqueue: EnqueueFn,
  remove: RemoveFn,
  meta: JobMeta
): Producers<TQueues> {
  const producers: Record<string, Record<string, unknown>> = {};

  for (const [key, definition] of Object.entries(definitions)) {
    producers[key] = Object.fromEntries(
      Object.entries((definition as QueueDefinition).jobs).map(
        ([jobName, job]) => [
          jobName,
          {
            add: (payload: unknown, options?: EnqueueOptions) =>
              enqueue(job, payload, options, meta),
            remove: (jobId: string) => remove(job.queue, jobId),
          },
        ]
      )
    );
  }

  return producers as Producers<TQueues>;
}

/** Exported for the option-mapping tests; the two call sites above are the real ones. */
export function toJobsOptions(
  defaults?: QueueDefaults,
  options?: EnqueueOptions
): JobsOptions {
  return {
    ...(defaults?.removeOnComplete !== undefined && {
      removeOnComplete: defaults.removeOnComplete,
    }),
    ...(defaults?.removeOnFail !== undefined && {
      removeOnFail: defaults.removeOnFail,
    }),
    ...(options?.delay !== undefined && { delay: options.delay }),
    ...(options?.priority !== undefined && { priority: options.priority }),
    ...(options?.jobId !== undefined && { jobId: options.jobId }),
    ...(options?.deduplicationId !== undefined && {
      // No `ttl`: a ttl-less key clears when the job finishes, which is what
      // lets the same key be enqueued again later.
      deduplication: { id: options.deduplicationId },
    }),
    ...pickRetry(defaults, options),
  };
}

function pickRetry(defaults?: QueueDefaults, options?: EnqueueOptions) {
  const attempts = options?.attempts ?? defaults?.attempts;
  const backoff = options?.backoff ?? defaults?.backoff;

  return {
    ...(attempts !== undefined && { attempts }),
    ...(backoff !== undefined && { backoff }),
  };
}
