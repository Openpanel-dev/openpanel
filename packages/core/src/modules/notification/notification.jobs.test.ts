// Job wiring — no ClickHouse/Postgres touched. The rule matching and
// dispatch logic themselves are exercised in notification.service.test.ts.

import { expect, test } from 'bun:test';
import type { Buffers, JobCtx } from '../../context';
import { createRecordingProducers } from '../../jobs/testing';
import { queues } from '../../jobs.registry';
import type { Logger } from '../../logger';
import type { Services } from '../../services';
import { notificationQueueJobs } from './notification.jobs';
import type { NotificationService } from './notification.service';

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

function stubJobCtx(notification: Partial<NotificationService>): JobCtx {
  const services: Services = {
    auth: {} as Services['auth'],
    notification: notification as NotificationService,
    insight: {} as Services['insight'],
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
    misc: {} as Services['misc'],
  };
  return {
    db: {},
    ch: {},
    redis: {},
    clients: {},
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
