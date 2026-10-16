import { expect, test } from 'bun:test';
import { z } from 'zod';
import { defineJob, defineQueue } from './define';
import { toJobsOptions } from './producers';
import { createRecordingProducers } from './testing';

const testQueue = defineQueue('test', {
  jobs: {
    greet: defineJob({
      payload: z.object({ name: z.string() }),
      handler: async () => undefined,
    }),
  },
});

const registry = { test: testQueue };

test('defineQueue binds each job to its queue and name', () => {
  expect(testQueue.jobs.greet).toMatchObject({ queue: 'test', name: 'greet' });
});

test('the payload is validated at the call site, not in a worker later', async () => {
  const producers = createRecordingProducers(registry);

  await expect(
    // @ts-expect-error the same mistake the schema catches at runtime
    producers.queues.test.greet.add({ name: 42 })
  ).rejects.toThrow();
  expect(producers.recorded).toHaveLength(0);
});

test('a scope stamps its meta onto everything enqueued through it', async () => {
  const producers = createRecordingProducers(registry);

  await producers.queues.test.greet.add({ name: 'unscoped' });
  await producers.scope({ requestId: 'req_1' }).test.greet.add({
    name: 'scoped',
  });

  expect(producers.recorded).toEqual([
    { queue: 'test', job: 'greet', payload: { name: 'unscoped' }, meta: {} },
    {
      queue: 'test',
      job: 'greet',
      payload: { name: 'scoped' },
      meta: { requestId: 'req_1' },
    },
  ]);
});

test('remove is recorded too, so the import retry flow is testable', async () => {
  const producers = createRecordingProducers(registry);

  await producers.queues.test.greet.remove('job_1');

  expect(producers.removed).toEqual([{ queue: 'test', jobId: 'job_1' }]);
});

test('queue defaults carry retention as {age, count}, which cohortCompute needs', () => {
  expect(
    toJobsOptions({
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { age: 3600, count: 100 },
      removeOnFail: { age: 86_400, count: 100 },
    })
  ).toEqual({
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 3600, count: 100 },
    removeOnFail: { age: 86_400, count: 100 },
  });

  expect(toJobsOptions({ removeOnComplete: true })).toEqual({
    removeOnComplete: true,
  });
});

test('all three legacy idempotency conventions survive the option mapping', () => {
  // sessions and insights key on jobId; cohort keys on deduplication and must
  // NOT be normalised onto jobId (cohort.service.ts records the deadlock).
  expect(toJobsOptions(undefined, { jobId: 'sessionEnd:v2:ses_1' })).toEqual({
    jobId: 'sessionEnd:v2:ses_1',
  });
  expect(toJobsOptions(undefined, { deduplicationId: 'cohort-coh_1' })).toEqual(
    { deduplication: { id: 'cohort-coh_1' } }
  );
  expect(toJobsOptions(undefined, {})).toEqual({});
});

test('a single enqueue overrides the queue default it names, and nothing else', () => {
  expect(
    toJobsOptions(
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      { attempts: 1, delay: 250 }
    )
  ).toEqual({
    attempts: 1,
    backoff: { type: 'exponential', delay: 5000 },
    delay: 250,
  });
});
