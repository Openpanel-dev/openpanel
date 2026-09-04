import { expect, test } from 'bun:test';
import { z } from 'zod';
import type { AppDeps, Buffers, JobCtx } from '../context';
import { queues } from '../jobs.registry';
import type { Logger } from '../logger';
import { defineJob, defineQueue } from './define';
import { wrap } from './envelope';
import { createRecordingProducers } from './testing';
import { runJob } from './workers';

function stubLogger(): Logger {
  const noop = () => undefined;
  const logger: Logger = {
    fatal: noop,
    error: noop,
    warn: noop,
    info: noop,
    debug: noop,
    trace: noop,
    child: () => logger,
  };
  return logger;
}

function stubDeps(): AppDeps {
  return {
    db: {},
    ch: {},
    redis: {},
    clients: {},
    buffers: {} as Buffers,
    producers: createRecordingProducers(queues),
    logger: stubLogger(),
    config: { selfHosted: true },
  };
}

const seen: { payload: unknown; ctx: JobCtx }[] = [];

const queue = defineQueue('import', {
  jobs: {
    import: defineJob({
      payload: z.object({ importId: z.string() }),
      handler: async (args) => {
        seen.push(args);
      },
    }),
  },
  compat: (data) =>
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === 'import'
      ? { job: 'import', payload: (data as { payload: unknown }).payload }
      : undefined,
});

function bullJob(name: string, data: unknown) {
  return { id: 'job_1', name, data, attemptsMade: 0 };
}

test('an enveloped job reaches its handler with the requestId that caused it', async () => {
  seen.length = 0;

  await runJob(
    queue,
    bullJob('import', wrap({ importId: 'imp_1' }, { requestId: 'req_1' })),
    stubDeps()
  );

  expect(seen).toHaveLength(1);
  expect(seen[0]?.payload).toEqual({ importId: 'imp_1' });
  expect(seen[0]?.ctx.requestId).toBe('req_1');
  expect(seen[0]?.ctx.job).toEqual({
    id: 'job_1',
    attempt: 1,
    queue: 'import',
    name: 'import',
  });
});

test('a legacy job reaches the same handler through the compat hook', async () => {
  seen.length = 0;

  await runJob(
    queue,
    bullJob('import', { type: 'import', payload: { importId: 'imp_1' } }),
    stubDeps()
  );

  expect(seen).toHaveLength(1);
  expect(seen[0]?.payload).toEqual({ importId: 'imp_1' });
  // No request caused it, so one is minted rather than left absent — a job's
  // own logs and its follow-up enqueues still correlate (ADR-018 R2).
  expect(seen[0]?.ctx.requestId).toMatch(/^[\w-]{21}$/);
});

test('a job the registry does not declare throws, never silently completes', async () => {
  await expect(
    runJob(queue, bullJob('nope', wrap({ importId: 'imp_1' }, {})), stubDeps())
  ).rejects.toThrow(/has no job named 'nope'/);
});

test('an unresolvable legacy shape throws', async () => {
  await expect(
    runJob(queue, bullJob('import', { surprise: true }), stubDeps())
  ).rejects.toThrow(/cannot resolve/);
});

test('the payload is re-parsed in the worker, not trusted', async () => {
  await expect(
    runJob(queue, bullJob('import', wrap({ importId: 42 }, {})), stubDeps())
  ).rejects.toThrow();
});
