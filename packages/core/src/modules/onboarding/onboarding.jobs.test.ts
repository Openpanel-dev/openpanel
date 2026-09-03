// Job/cron-fragment wiring — no ClickHouse/Postgres touched. The service
// method itself is exercised in onboarding.service.test.ts.

import { expect, test } from 'bun:test';
import type { JobCtx } from '../../context';
import { createRecordingProducers } from '../../jobs/testing';
import { queues } from '../../jobs.registry';
import type { Logger } from '../../logger';
import type { Services } from '../../services';
import { onboardingCronJobs, onboardingCronSchedules } from './onboarding.jobs';
import type { OnboardingService } from './onboarding.service';

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
  onboarding: Partial<OnboardingService>,
  jobName = 'test'
): JobCtx {
  const services: Services = {
    auth: {} as Services['auth'],
    notification: {} as Services['notification'],
    insight: {} as Services['insight'],
    gsc: {} as Services['gsc'],
    import: {} as Services['import'],
    cohort: {} as Services['cohort'],
    organization: {} as Services['organization'],
    onboarding: onboarding as OnboardingService,
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

// Byte-identity with the id/cadence schedulers.test.ts's golden snapshot pins
// (apps/worker/src/boot-cron.ts).
test('the onboarding cron fragment carries V1 id and cadence unchanged', () => {
  expect(onboardingCronSchedules).toEqual([
    { id: 'onboarding', schedule: { pattern: '0 * * * *' } },
  ]);
});
