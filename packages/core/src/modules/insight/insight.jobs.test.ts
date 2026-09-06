// Job/cron-fragment wiring — no ClickHouse/Postgres touched. The service
// methods themselves are exercised in insight.service.test.ts.

import { expect, test } from 'bun:test';
import type { AppDeps, Buffers, JobCtx } from '../../context';
import { createRecordingProducers } from '../../jobs/testing';
import { queues } from '../../jobs.registry';
import type { Logger } from '../../logger';
import type { Services } from '../../services';
import {
  insightCronJobs,
  insightCronSchedules,
  insightQueueJobs,
} from './insight.jobs';
import type { InsightService } from './insight.service';

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

// A plain object literal, not createCtx/extendCtx: `services` is installed
// there as a getter with no setter (the lazy-build seam, ADR-007), which
// makes it unassignable afterwards — exactly what a fake `services.insight`
// needs to be for a handler test.
function stubJobCtx(
  insight: Partial<InsightService>,
  jobName = 'test'
): JobCtx {
  const services: Services = {
    auth: {} as Services['auth'],
    notification: {} as Services['notification'],
    insight: insight as InsightService,
    gsc: {} as Services['gsc'],
    cohort: {} as Services['cohort'],
    import: {} as Services['import'],
    ingest: {} as Services['ingest'],
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
    job: { id: 'job_1', attempt: 0, queue: 'cron', name: jobName },
  };
}

test('the insight jobs registry declares insightsProject on the insights queue', () => {
  expect(queues.insights.jobs.insightsProject).toMatchObject({
    queue: 'insights',
    name: 'insightsProject',
  });
});

test('the insight cron fragment is spread into the cron queue', () => {
  // Subset, not exact equality: other modules (e.g. gsc, M5-002) spread
  // their own fragments into the same cron queue. jobs.registry.test.ts owns
  // the exhaustive membership check.
  expect(Object.keys(queues.cron.jobs)).toEqual(
    expect.arrayContaining(['insightCleanup', 'insightsDaily', 'weeklyDigest'])
  );
});

test('insightsProject validates its payload', () => {
  expect(() =>
    insightQueueJobs.insightsProject.payload.parse({ projectId: 'p1' })
  ).toThrow();
  expect(
    insightQueueJobs.insightsProject.payload.parse({
      projectId: 'p1',
      date: '2026-09-03',
    })
  ).toEqual({ projectId: 'p1', date: '2026-09-03' });
});

test('insightsProject delegates to runProjectInsights', async () => {
  const calls: unknown[] = [];
  const ctx = stubJobCtx({
    runProjectInsights: async (args) => {
      calls.push(args);
    },
  });

  await insightQueueJobs.insightsProject.handler({
    payload: { projectId: 'p1', date: '2026-09-03' },
    ctx,
  });

  expect(calls).toEqual([{ projectId: 'p1', date: '2026-09-03' }]);
});

test('insightsDaily fans out one insightsProject enqueue per candidate, jobId deduped by day+project', async () => {
  const producers = createRecordingProducers(queues);
  const ctx: JobCtx = {
    db: {} as AppDeps['db'],
    ch: {} as AppDeps['ch'],
    redis: {} as AppDeps['redis'],
    clients: {} as AppDeps['clients'],
    buffers: {} as Buffers,
    logger: stubLogger(),
    queues: producers.queues,
    services: {
      auth: {} as Services['auth'],
      notification: {} as Services['notification'],
      insight: {
        listDailyInsightCandidates: async (date) => [
          { projectId: 'p1', date },
          { projectId: 'p2', date },
        ],
      } as InsightService,
      gsc: {} as Services['gsc'],
      cohort: {} as Services['cohort'],
      import: {} as Services['import'],
      ingest: {} as Services['ingest'],
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
    },
    requestId: 'req_1',
    job: { id: 'job_1', attempt: 0, queue: 'cron', name: 'insightsDaily' },
  };

  await insightCronJobs.insightsDaily.handler({ payload: null, ctx });

  expect(producers.recorded).toHaveLength(2);
  expect(producers.recorded.map((r) => r.job)).toEqual([
    'insightsProject',
    'insightsProject',
  ]);
  const today = new Date().toISOString().slice(0, 10);
  expect(producers.recorded.map((r) => r.payload)).toEqual([
    { projectId: 'p1', date: today },
    { projectId: 'p2', date: today },
  ]);
});

test('insightCleanup delegates to cleanupStaleInsights', async () => {
  let called = false;
  const ctx = stubJobCtx(
    {
      cleanupStaleInsights: async () => {
        called = true;
        return { insights: 0, events: 0 };
      },
    },
    'insightCleanup'
  );

  await insightCronJobs.insightCleanup.handler({ payload: null, ctx });
  expect(called).toBe(true);
});

test('weeklyDigest delegates to sendWeeklyDigests', async () => {
  let called = false;
  const ctx = stubJobCtx(
    {
      sendWeeklyDigests: async () => {
        called = true;
        return { projects: 0, sent: 0 };
      },
    },
    'weeklyDigest'
  );

  await insightCronJobs.weeklyDigest.handler({ payload: null, ctx });
  expect(called).toBe(true);
});

// Byte-identity with the ids/cadences schedulers.test.ts's golden snapshot
// pins (apps/worker/src/boot-cron.ts).
test('the insight cron fragment carries V1 ids and cadences unchanged', () => {
  expect(insightCronSchedules).toEqual([
    { id: 'insightsDaily', schedule: { pattern: '0 2 * * *' } },
    { id: 'insightCleanup', schedule: { pattern: '30 4 * * *' } },
    { id: 'weeklyDigest', schedule: { pattern: '0 8 * * 1' } },
  ]);
});
