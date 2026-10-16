// Job/cron-fragment wiring — no ClickHouse/Postgres touched. The service
// method itself is exercised in onboarding.service.test.ts.

import { expect, test } from 'bun:test';
import { testCoreConfig } from '../../../test/config-fixture';
import type { AppDeps, Buffers, JobCtx } from '../../context';
import { createRecordingProducers } from '../../jobs/testing';
import { queues } from '../../jobs.registry';
import type { Logger } from '../../logger';
import type { Services } from '../../services';
import { onboardingCronJobs } from './onboarding.jobs';
import type { createOnboardingService } from './onboarding.service';

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

function stubJobCtx(
  onboarding: Partial<ReturnType<typeof createOnboardingService>>,
  jobName = 'test'
): JobCtx {
  const services: Services = {
    auth: {} as Services['auth'],
    notification: {} as Services['notification'],
    insight: {} as Services['insight'],
    integration: {} as Services['integration'],
    gsc: {} as Services['gsc'],
    import: {} as Services['import'],
    ingest: {} as Services['ingest'],
    cohort: {} as Services['cohort'],
    organization: {} as Services['organization'],
    onboarding: onboarding as ReturnType<typeof createOnboardingService>,
    session: {} as Services['session'],
    event: {} as Services['event'],
    profile: {} as Services['profile'],
    group: {} as Services['group'],
    chart: {} as Services['chart'],
    funnel: {} as Services['funnel'],
    conversion: {} as Services['conversion'],
    sankey: {} as Services['sankey'],
    retention: {} as Services['retention'],
    overview: {} as Services['overview'],
    pages: {} as Services['pages'],
    realtime: {} as Services['realtime'],
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
    prisma: {} as AppDeps['prisma'],
    ch: {} as AppDeps['ch'],
    redis: {} as AppDeps['redis'],
    clients: {} as AppDeps['clients'],
    buffers: {} as Buffers,
    logger: stubLogger(),
    queues: createRecordingProducers(queues).queues,
    config: testCoreConfig(),
    services,
    requestId: 'req_1',
    job: { id: 'job_1', attempt: 0, queue: 'cron', name: jobName },
  };
}

test('the cron queue declares onboarding on the cron queue', () => {
  expect(queues.cron.jobs.onboarding).toMatchObject({
    queue: 'cron',
    name: 'onboarding',
  });
});

test('the onboarding cron fragment is spread into the cron queue', () => {
  expect(queues.cron.jobs.onboarding).toBeDefined();
});

test('onboarding delegates to runOnboardingCron', async () => {
  let called = false;
  const ctx = stubJobCtx({
    runOnboardingCron: async () => {
      called = true;
      return { totalOrgs: 1, emailsSent: 1, orgsCompleted: 0, orgsSkipped: 0 };
    },
  });

  await onboardingCronJobs.onboarding.handler({ payload: null, ctx });

  expect(called).toBe(true);
});

test('onboarding does not log when the cron is a self-hosted no-op', async () => {
  const logged: unknown[] = [];
  const ctx = stubJobCtx({ runOnboardingCron: async () => null });
  ctx.logger = {
    ...ctx.logger,
    info: (obj: unknown) => {
      logged.push(obj);
    },
  };

  await onboardingCronJobs.onboarding.handler({ payload: null, ctx });

  expect(logged).toEqual([]);
});

// The cadence lives on the job itself, so this reads it straight off the
// registry.
test('the onboarding cron fragment keeps its scheduler id and cadence', () => {
  expect(queues.cron.jobs.onboarding.cron).toEqual({
    pattern: '0 * * * *',
  });
});
