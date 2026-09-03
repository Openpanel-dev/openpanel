// Job/cron-fragment wiring — no ClickHouse/Postgres touched. The service
// methods themselves are exercised in gsc.service.test.ts.

import { expect, test } from 'bun:test';
import type { JobCtx } from '../../context';
import { createRecordingProducers } from '../../jobs/testing';
import { queues } from '../../jobs.registry';
import type { Logger } from '../../logger';
import type { Services } from '../../services';
import { gscCronJobs, gscCronSchedules, gscQueueJobs } from './gsc.jobs';
import type { GscService } from './gsc.service';

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

function stubJobCtx(gsc: Partial<GscService>, jobName = 'test'): JobCtx {
  const services: Services = {
    auth: {} as Services['auth'],
    insight: {} as Services['insight'],
    gsc: gsc as GscService,
  };
  return {
    db: {},
    ch: {},
    redis: {},
    clients: {},
    buffers: {},
    logger: stubLogger(),
    queues: createRecordingProducers(queues).queues,
    services,
    requestId: 'req_1',
    job: { id: 'job_1', attempt: 0, queue: 'gsc', name: jobName },
  };
}

test('the gsc jobs registry declares gscProjectSync and gscProjectBackfill on the gsc queue', () => {
  expect(queues.gsc.jobs.gscProjectSync).toMatchObject({
    queue: 'gsc',
    name: 'gscProjectSync',
  });
  expect(queues.gsc.jobs.gscProjectBackfill).toMatchObject({
    queue: 'gsc',
    name: 'gscProjectBackfill',
  });
});

test('the gsc cron fragment is spread into the cron queue', () => {
  expect(queues.cron.jobs.gscSync).toBeDefined();
});

test('gscProjectSync validates its payload', () => {
  expect(() => gscQueueJobs.gscProjectSync.payload.parse({})).toThrow();
  expect(
    gscQueueJobs.gscProjectSync.payload.parse({ projectId: 'p1' })
  ).toEqual({ projectId: 'p1' });
});

test('gscProjectBackfill validates its payload', () => {
  expect(() => gscQueueJobs.gscProjectBackfill.payload.parse({})).toThrow();
  expect(
    gscQueueJobs.gscProjectBackfill.payload.parse({ projectId: 'p1' })
  ).toEqual({ projectId: 'p1' });
});

test('gscProjectSync delegates to runProjectSync', async () => {
  const calls: unknown[] = [];
  const ctx = stubJobCtx({
    runProjectSync: async (projectId) => {
      calls.push(projectId);
    },
  });

  await gscQueueJobs.gscProjectSync.handler({
    payload: { projectId: 'p1' },
    ctx,
  });

  expect(calls).toEqual(['p1']);
});

test('gscProjectBackfill delegates to runProjectBackfill', async () => {
  const calls: unknown[] = [];
  const ctx = stubJobCtx({
    runProjectBackfill: async (projectId) => {
      calls.push(projectId);
    },
  });

  await gscQueueJobs.gscProjectBackfill.handler({
    payload: { projectId: 'p1' },
    ctx,
  });

  expect(calls).toEqual(['p1']);
});

test('gscSync fans out one gscProjectSync enqueue per connected project', async () => {
  const producers = createRecordingProducers(queues);
  const ctx: JobCtx = {
    db: {},
    ch: {},
    redis: {},
    clients: {},
    buffers: {},
    logger: stubLogger(),
    queues: producers.queues,
    services: {
      auth: {} as Services['auth'],
      insight: {} as Services['insight'],
      gsc: {
        listConnectionsForSync: async () => [
          { projectId: 'p1' },
          { projectId: 'p2' },
        ],
      } as GscService,
    },
    requestId: 'req_1',
    job: { id: 'job_1', attempt: 0, queue: 'cron', name: 'gscSync' },
  };

  await gscCronJobs.gscSync.handler({ payload: null, ctx });

  expect(producers.recorded).toHaveLength(2);
  expect(producers.recorded.map((r) => r.job)).toEqual([
    'gscProjectSync',
    'gscProjectSync',
  ]);
  expect(producers.recorded.map((r) => r.payload)).toEqual([
    { projectId: 'p1' },
    { projectId: 'p2' },
  ]);
});

// Byte-identity with the id/cadence schedulers.test.ts's golden snapshot pins
// (apps/worker/src/boot-cron.ts).
test('the gsc cron fragment carries V1 id and cadence unchanged', () => {
  expect(gscCronSchedules).toEqual([
    { id: 'gscSync', schedule: { pattern: '0 3 * * *' } },
  ]);
});
