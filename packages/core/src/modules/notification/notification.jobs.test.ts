// Job wiring — no ClickHouse/Postgres touched. The rule matching and
// dispatch logic themselves are exercised in notification.service.test.ts.

import { expect, test } from 'bun:test';
import type { AppDeps, Buffers, JobCtx } from '../../context';
import { createRecordingProducers } from '../../jobs/testing';
import { queues } from '../../jobs.registry';
import type { Logger } from '../../logger';
import type { Services } from '../../services';
import { notificationQueueJobs } from './notification.jobs';
import type { createNotificationService } from './notification.service';

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
  notification: Partial<ReturnType<typeof createNotificationService>>
): JobCtx {
  const services: Services = {
    auth: {} as Services['auth'],
    notification: notification as ReturnType<typeof createNotificationService>,
    insight: {} as Services['insight'],
    integration: {} as Services['integration'],
    cohort: {} as Services['cohort'],
    gsc: {} as Services['gsc'],
    import: {} as Services['import'],
    ingest: {} as Services['ingest'],
    organization: {} as Services['organization'],
    onboarding: {} as Services['onboarding'],
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
    ch: {} as AppDeps['ch'],
    redis: {} as AppDeps['redis'],
    clients: {} as AppDeps['clients'],
    buffers: {} as Buffers,
    logger: stubLogger(),
    queues: createRecordingProducers(queues).queues,
    services,
    requestId: 'req_1',
    job: {
      id: 'job_1',
      attempt: 0,
      queue: 'notification',
      name: 'sendNotification',
    },
  };
}

test('the notification queue declares exactly the sendNotification job', () => {
  expect(Object.keys(notificationQueueJobs)).toEqual(['sendNotification']);
  expect(queues.notification.jobs.sendNotification).toMatchObject({
    queue: 'notification',
    name: 'sendNotification',
  });
});

test('sendNotification validates its payload', () => {
  expect(() =>
    notificationQueueJobs.sendNotification.payload.parse({})
  ).toThrow();
  expect(
    notificationQueueJobs.sendNotification.payload.parse({
      notification: {
        projectId: 'proj_1',
        title: 'Hello',
        message: 'World',
      },
    })
  ).toEqual({
    notification: {
      projectId: 'proj_1',
      title: 'Hello',
      message: 'World',
    },
  });
});

test('sendNotification delegates to ctx.services.notification.dispatch', async () => {
  const calls: unknown[] = [];
  const ctx = stubJobCtx({
    dispatch: async (notification) => {
      calls.push(notification);
    },
  });

  await notificationQueueJobs.sendNotification.handler({
    payload: {
      notification: {
        projectId: 'proj_1',
        title: 'Hello',
        message: 'World',
        sendToApp: true,
      },
    },
    ctx,
  });

  expect(calls).toEqual([
    { projectId: 'proj_1', title: 'Hello', message: 'World', sendToApp: true },
  ]);
});
