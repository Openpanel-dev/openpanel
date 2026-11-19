import type { QueueMap } from './define';
import type { JobMeta } from './envelope';
import {
  buildProducers,
  type EnqueueFn,
  type ProducerHandle,
  type RemoveFn,
} from './producers';

export interface RecordedJob {
  queue: string;
  job: string;
  payload: unknown;
  meta: JobMeta;
}

export interface RemovedJob {
  queue: string;
  jobId: string;
}

export interface RecordingProducerHandle<TQueues extends QueueMap>
  extends ProducerHandle<TQueues> {
  recorded: RecordedJob[];
  removed: RemovedJob[];
}

/**
 * Producers that record instead of enqueueing, so a test can assert what a
 * procedure would have queued without a Redis anywhere near it.
 *
 * Payloads are still validated against their schemas — the point is to keep
 * the contract, not to bypass it. Handlers need none of this: a handler is a
 * plain function of `{ payload, ctx }` and is called directly.
 */
export function createRecordingProducers<TQueues extends QueueMap>(
  definitions: TQueues
): RecordingProducerHandle<TQueues> {
  const recorded: RecordedJob[] = [];
  const removed: RemovedJob[] = [];
  let nextId = 1;

  // async, not a returned Promise: `parse` throws, and a caller asserting on
  // a rejection must not get a synchronous throw instead.
  const enqueue: EnqueueFn = async (job, payload, _options, meta) => {
    recorded.push({
      queue: job.queue,
      job: job.name,
      payload: job.payload.parse(payload),
      meta: meta ?? {},
    });
    return await Promise.resolve(String(nextId++));
  };

  const remove: RemoveFn = async (queue, jobId) => {
    removed.push({ queue, jobId });
    await Promise.resolve();
  };

  return {
    recorded,
    removed,
    queues: buildProducers(definitions, enqueue, remove, {}),
    scope: (meta) => buildProducers(definitions, enqueue, remove, meta),
    enqueue,
    remove,
    bullQueues: [],
    close: () => Promise.resolve(),
  };
}
