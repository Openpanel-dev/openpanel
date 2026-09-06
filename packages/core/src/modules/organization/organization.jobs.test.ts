// Job/cron-fragment wiring — no ClickHouse/Postgres touched. The service
// method itself is exercised in organization.service.test.ts.

import { expect, test } from 'bun:test';
import type { AppDeps, Buffers, JobCtx } from '../../context';
import { createRecordingProducers } from '../../jobs/testing';
import { queues } from '../../jobs.registry';
import type { Logger } from '../../logger';
import type { Services } from '../../services';
import {
  organizationCronJobs,
  organizationCronSchedules,
} from './organization.jobs';
import type { OrganizationService } from './organization.service';

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
  organization: Partial<OrganizationService>,
  jobName = 'test'
): JobCtx {
  const services: Services = {
    auth: {} as Services['auth'],
    notification: {} as Services['notification'],
    insight: {} as Services['insight'],
    gsc: {} as Services['gsc'],
    import: {} as Services['import'],
    ingest: {} as Services['ingest'],
    cohort: {} as Services['cohort'],
    organization: organization as OrganizationService,
    onboarding: {} as Services['onboarding'],
    session: {} as Services['session'],
    event: {} as Services['event'],
    profile: {} as Services['profile'],
    group: {} as Services['group'],
    chart: {} as Services['chart'],
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

test('the cron queue declares delete on the cron queue', () => {
  expect(queues.cron.jobs.delete).toMatchObject({
    queue: 'cron',
    name: 'delete',
  });
});

test('the organization cron fragment is spread into the cron queue', () => {
  expect(queues.cron.jobs.delete).toBeDefined();
  expect(queues.cron.jobs.windDown).toBeDefined();
});

test('delete delegates to runDeleteCron', async () => {
  let called = false;
  const ctx = stubJobCtx({
    runDeleteCron: async () => {
      called = true;
      return { organizations: 1, projects: 2 };
    },
  });

  await organizationCronJobs.delete.handler({ payload: null, ctx });

  expect(called).toBe(true);
});

// Byte-identity with the id/cadence schedulers.test.ts's golden snapshot pins
// (apps/worker/src/boot-cron.ts).
test('the organization cron fragment carries V1 id and cadence unchanged', () => {
  expect(organizationCronSchedules).toEqual([
    { id: 'delete', schedule: { pattern: '0 * * * *' } },
    { id: 'windDown', schedule: { pattern: '0 * * * *' } },
  ]);
});
