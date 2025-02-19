import type { Job } from 'bullmq';
import { last } from 'ramda';

import { logger as baseLogger } from '@/utils/logger';
import { getTime } from '@openpanel/common';
import {
  type IServiceEvent,
  TABLE_NAMES,
  checkNotificationRulesForSessionEnd,
  createEvent,
  eventBuffer,
  getEvents,
} from '@openpanel/db';
import type { ILogger } from '@openpanel/logger';
import type { EventsQueuePayloadCreateSessionEnd } from '@openpanel/queue';

async function getCompleteSession({
  projectId,
  sessionId,
  hoursInterval,
}: {
  projectId: string;
  sessionId: string;
  hoursInterval: number;
}) {
  const sql = `
    SELECT * FROM ${TABLE_NAMES.events} 
    WHERE 
      session_id = '${sessionId}' 
      AND project_id = '${projectId}'
      AND created_at > now() - interval ${hoursInterval} HOUR
    ORDER BY created_at DESC
  `;

  return getEvents(sql);
}

async function getCompleteSessionWithSessionStart({
  projectId,
  sessionId,
  logger,
}: {
  projectId: string;
  sessionId: string;
  logger: ILogger;
}): Promise<ReturnType<typeof getEvents>> {
  const intervals = [1, 6, 12, 24, 72];
  let intervalIndex = 0;
  for (const hoursInterval of intervals) {
    const events = await getCompleteSession({
      projectId,
      sessionId,
      hoursInterval,
    });

    if (events.find((event) => event.name === 'session_start')) {
      return events;
    }

    const nextHoursInterval = intervals[++intervalIndex];
    if (nextHoursInterval) {
      logger.warn(`Checking last ${nextHoursInterval} hours for session_start`);
    }
  }

  return [];
}

export async function createSessionEnd(
  job: Job<EventsQueuePayloadCreateSessionEnd>,
) {
  const logger = baseLogger.child({
    payload: job.data.payload,
    jobId: job.id,
    reqId: job.data.payload.properties?.__reqId ?? 'unknown',
  });

  const payload = job.data.payload;

  const [lastScreenView, eventsInDb] = await Promise.all([
    eventBuffer.getLastScreenView({
      projectId: payload.projectId,
      sessionId: payload.sessionId,
    }),
    getCompleteSessionWithSessionStart({
      projectId: payload.projectId,
      sessionId: payload.sessionId,
      logger,
    }),
  ]);

  // sort last inserted first
  const events = [lastScreenView, ...eventsInDb]
    .filter((event): event is IServiceEvent => !!event)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

  const sessionDuration = events.reduce((acc, event) => {
    return acc + event.duration;
  }, 0);

  let sessionStart = events.find((event) => event.name === 'session_start');
  const lastEvent = events[0];
  const screenViews = events.filter((event) => event.name === 'screen_view');

  if (!sessionStart) {
    const firstScreenView = last(screenViews);

    if (!firstScreenView) {
      throw new Error('Could not found session_start or any screen_view');
    }

    logger.warn('Creating session_start since it was not found');

    sessionStart = {
      ...firstScreenView,
      name: 'session_start',
      createdAt: new Date(getTime(firstScreenView.createdAt) - 100),
    };

    await createEvent(sessionStart);
  }

  if (!lastEvent) {
    throw new Error('No last event found');
  }

  await checkNotificationRulesForSessionEnd(events);

  logger.info('Creating session_end', {
    sessionStart,
    lastEvent,
    screenViews,
    sessionDuration,
    events,
    lastScreenView: lastScreenView ? lastScreenView : 'none',
  });

  return createEvent({
    ...sessionStart,
    properties: {
      ...sessionStart.properties,
      ...(screenViews[0]?.properties ?? {}),
      __bounce: screenViews.length <= 1,
    },
    name: 'session_end',
    duration: sessionDuration,
    path: screenViews[0]?.path ?? '',
    createdAt: new Date(getTime(lastEvent.createdAt) + 1000),
    profileId: lastEvent.profileId || sessionStart.profileId,
  });
}
