// Job/cron-fragment wiring — no ClickHouse/Postgres touched. The service
// methods themselves are exercised in cohort.service.test.ts.

import { expect, test } from 'bun:test';
import type { AppDeps, Buffers, JobCtx } from '../../context';
import { createRecordingProducers } from '../../jobs/testing';
import { queues } from '../../jobs.registry';
import type { Logger } from '../../logger';
import type { Services } from '../../services';
import {
  cohortCronJobs,
  cohortCronSchedules,
  cohortQueueJobs,
} from './cohort.jobs';
import type { CohortService } from './cohort.service';

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

function stubJobCtx(cohort: Partial<CohortService>, jobName = 'test'): JobCtx {
  const services: Services = {
    auth: {} as Services['auth'],
    notification: {} as Services['notification'],
    insight: {} as Services['insight'],
    gsc: {} as Services['gsc'],
    import: {} as Services['import'],
    ingest: {} as Services['ingest'],
    cohort: cohort as CohortService,
    organization: {} as Services['organization'],
    onboarding: {} as Services['onboarding'],
    session: {} as Services['session'],
    event: {} as Services['event'],
    profile: {} as Services['profile'],
    group: {} as Services['group'],
    chart: {} as Services['chart'],
    misc: {} as Services['misc'],
    report: {} as Services['report'],
    dashboard: {} as Services['dashboard'],
    export: {} as Services['export'],
    share: {} as Services['share'],
    reference: {} as Services['reference'],
    client: {} as Services['client'],
    project: {} as Services['project'],
    user: {} as Services['user'],
    subscription: {} as Services['subscription'],
    salt: {} as Services['salt'],
    conversation: {} as Services['conversation'],
    assistant: {} as Services['assistant'],
    mcp: {} as Services['mcp'],
  };
  return {
    db: {} as AppDeps['db'],
    ch: {} as AppDeps['ch'],
    redis: {} as AppDeps['redis'],
    clients: {} as AppDeps['clients'],
    buffers: {} as Buffers,
    logger: stubLogger(),
    queues: createRecordingProducers(queues).queues,
    services,
    requestId: 'req_1',
    job: { id: 'job_1', attempt: 0, queue: 'cohortCompute', name: jobName },
  };
}

test('the cohortCompute jobs registry declares cohortCompute on the cohortCompute queue', () => {
  expect(queues.cohortCompute.jobs.cohortCompute).toMatchObject({
    queue: 'cohortCompute',
    name: 'cohortCompute',
  });
});

test('the cohort cron fragment is spread into the cron queue', () => {
  expect(queues.cron.jobs.cohortRefresh).toBeDefined();
});

test('cohortCompute validates its payload', () => {
  expect(() => cohortQueueJobs.cohortCompute.payload.parse({})).toThrow();
  expect(
    cohortQueueJobs.cohortCompute.payload.parse({ cohortId: 'c1' })
  ).toEqual({ cohortId: 'c1' });
});

test('cohortCompute delegates to updateMembership', async () => {
  const calls: unknown[] = [];
  const ctx = stubJobCtx({
    updateMembership: async (cohortId) => {
      calls.push(cohortId);
    },
  });

  await cohortQueueJobs.cohortCompute.handler({
    payload: { cohortId: 'c1' },
    ctx,
  });

  expect(calls).toEqual(['c1']);
});

test('cohortRefresh fans out one enqueueCompute per non-static cohort', async () => {
  const calls: unknown[] = [];
  const ctx = stubJobCtx({
    listRefreshableCohortIds: async () => ['c1', 'c2'],
    enqueueCompute: async (cohortId) => {
      calls.push(cohortId);
    },
  });

  await cohortCronJobs.cohortRefresh.handler({ payload: null, ctx });

  expect(calls).toEqual(['c1', 'c2']);
});

// Byte-identity with the id/cadence schedulers.test.ts's golden snapshot pins
// (apps/worker/src/boot-cron.ts).
test('the cohort cron fragment carries V1 id and cadence unchanged', () => {
  expect(cohortCronSchedules).toEqual([
    { id: 'cohortRefresh', schedule: { pattern: '*/30 * * * *' } },
  ]);
});
