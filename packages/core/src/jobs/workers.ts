import {
  type Job as BullJob,
  Worker as BullWorker,
  type ConnectionOptions,
} from 'bullmq';
import { type AppDeps, createCtx, extendCtx, type JobCtx } from '../context';
import { REQUEST_ID_LENGTH, REQUEST_ID_LOG_FIELD } from '../logger';
import { generateId } from '../shared/id';
import { resolveJob } from './compat';
import type { QueueDefinition, QueueMap } from './define';
import { isEnvelope } from './envelope';
import { queueKey } from './naming';

export interface TerminalFailure {
  queue: string;
  job: string;
  jobId?: string;
  attempts: number;
  error: Error;
  data: unknown;
}

export interface StartWorkersOptions<TQueues extends QueueMap> {
  /** Already filtered to the queues this role consumes. */
  definitions: TQueues;
  deps: AppDeps;
  /**
   * Called once per queue: a worker blocks its connection, so it cannot share
   * one. The caller keeps what it hands over and closes it.
   */
  createConnection: (name: string) => ConnectionOptions;
  cluster?: boolean;
  namespace?: string;
  /**
   * A job that has exhausted its attempts. Five of the seven queues never
   * retry, so for those this fires on the first throw.
   */
  onTerminalFailure?: (failure: TerminalFailure) => void;
}

export interface WorkerHandle {
  /**
   * Stops taking new jobs and waits for the running ones. Whatever supervises
   * the process has to allow longer than the slowest job takes, or the drain
   * is killed halfway and every interrupted job comes back as a stalled retry.
   *
   * Closes the workers, not the connections they were handed.
   */
  close(): Promise<void>;
}

/**
 * Starts one worker per queue handed in. Only a process whose role includes
 * consuming calls this; an API-only process builds producers and stops there.
 */
export function startWorkers<TQueues extends QueueMap>({
  definitions,
  deps,
  createConnection,
  cluster,
  namespace,
  onTerminalFailure,
}: StartWorkersOptions<TQueues>): WorkerHandle {
  const started = Object.values(definitions).map((definition) => {
    const key = queueKey(definition.name, { cluster, namespace });
    const logger = deps.logger.child({ queue: definition.name });

    const worker = new BullWorker(key, (job) => runJob(definition, job, deps), {
      connection: createConnection(`worker:${definition.name}`),
      ...(definition.worker?.concurrency !== undefined && {
        concurrency: definition.worker.concurrency,
      }),
      ...(definition.worker?.limiter !== undefined && {
        limiter: definition.worker.limiter,
      }),
    });

    // Fires on the connection itself, not on any one job. V1 lost the api
    // process roughly daily to unlistened ioredis ECONNRESETs re-emitted here.
    worker.on('error', (error) => logger.error({ err: error }, 'worker error'));

    // A stall means the job was taken and then its lock lapsed: the process
    // died mid-job, or the handler blocked the event loop past the lock.
    worker.on('stalled', (jobId) =>
      logger.warn({ jobId }, 'job stalled and will be retried')
    );

    worker.on('failed', (job, error) => {
      // `failed` fires on every attempt; only a finished one is out of retries.
      if (!job?.finishedOn) {
        return;
      }

      logger.error(
        {
          err: error,
          jobId: job.id,
          job: job.name,
          attempts: job.attemptsMade,
        },
        'job failed terminally'
      );
      onTerminalFailure?.({
        queue: definition.name,
        job: job.name,
        jobId: job.id,
        attempts: job.attemptsMade,
        error,
        data: job.data,
      });
    });

    logger.info({ key }, 'worker started');
    return worker;
  });

  return {
    close: async () => {
      await Promise.all(started.map((worker) => worker.close()));
    },
  };
}

/** The shape of a BullMQ job this needs, so a test does not have to build one. */
export interface RunnableJob {
  id?: string;
  name: string;
  data: unknown;
  attemptsMade: number;
}

/**
 * Exported for the worker tests, and it is what the `BullWorker` processor
 * above calls. Throws on a job it cannot resolve or does not declare — V1
 * completed those having done nothing (ADR-005 risk 2).
 */
export async function runJob(
  definition: QueueDefinition,
  job: RunnableJob | BullJob,
  deps: AppDeps
): Promise<void> {
  const resolved = resolveJob(definition, { name: job.name, data: job.data });

  const jobDefinition = definition.jobs[resolved.job];
  if (!jobDefinition) {
    throw new Error(
      `Queue '${definition.name}' has no job named '${resolved.job}'`
    );
  }

  // Parsed rather than trusted: this job may have been enqueued by the deploy
  // this one is replacing, under the previous shape of the schema.
  const payload = jobDefinition.payload.parse(resolved.payload);

  const attempt = job.attemptsMade + 1;
  // A scheduled or legacy job has no originating request; minting one keeps
  // its own logs and its follow-up enqueues correlated (ADR-018 R2).
  const requestId =
    resolved.meta.requestId ?? generateId(undefined, REQUEST_ID_LENGTH);

  const logger = deps.logger.child({
    queue: definition.name,
    job: resolved.job,
    jobId: job.id,
    attempt,
    [REQUEST_ID_LOG_FIELD]: requestId,
  });

  const ctx: JobCtx = extendCtx(createCtx(deps, { requestId, logger }), {
    job: {
      id: job.id ?? '',
      attempt,
      queue: definition.name,
      name: resolved.job,
    },
  });

  // The registry erases each handler's payload type so the machinery can hold
  // all of them (see `AnyJob`); the schema above is what re-establishes it.
  const handler = jobDefinition.handler as (args: {
    payload: unknown;
    ctx: JobCtx;
  }) => Promise<void>;

  // `debug`, not `info`: `sessions` runs one of these per session close.
  // `legacy` is the cutover's own signal — while it is still ever true, a
  // V1-shaped job is still being replayed and the compat hooks cannot go
  // (ADR-005 risk 1).
  const legacy = !isEnvelope(job.data);
  logger.debug({ legacy }, 'job started');
  const startedAt = performance.now();

  await handler({ payload, ctx });

  logger.debug(
    { legacy, durationMs: Math.round(performance.now() - startedAt) },
    'job completed'
  );
}
