import type { Job } from 'bullmq';

import { logger as baseLogger } from '@/utils/logger';
import { getTime } from '@openpanel/common';
import {
  type IServiceEvent,
  TABLE_NAMES,
  checkNotificationRulesForSessionEnd,
  createEvent,
  eventBuffer,
  formatClickhouseDate,
  getEvents,
} from '@openpanel/db';
import type { EventsQueuePayloadCreateSessionEnd } from '@openpanel/queue';

// Grabs session_start and screen_views + the last occured event
async function getNecessarySessionEvents({
  projectId,
  sessionId,
  createdAt,
}: {
  projectId: string;
  sessionId: string;
  createdAt: Date;
}): Promise<ReturnType<typeof getEvents>> {
  const sql = `
    SELECT * FROM ${TABLE_NAMES.events} 
    WHERE 
      session_id = '${sessionId}' 
      AND project_id = '${projectId}'
      AND created_at >= '${formatClickhouseDate(new Date(new Date(createdAt).getTime() - 1000 * 60 * 5))}'
      AND (
        name IN ('screen_view', 'session_start') 
        OR created_at = (
          SELECT MAX(created_at) 
          FROM ${TABLE_NAMES.events} 
          WHERE session_id = '${sessionId}' 
          AND project_id = '${projectId}'
          AND created_at >= '${formatClickhouseDate(new Date(new Date(createdAt).getTime() - 1000 * 60 * 5))}'
          AND name NOT IN ('screen_view', 'session_start')
        )
      )
    ORDER BY created_at DESC;
  `;

  const [lastScreenView, eventsInDb] = await Promise.all([
    eventBuffer.getLastScreenView({
      projectId,
      sessionId,
    }),
    getEvents(sql),
  ]);

  // sort last inserted first
  return [lastScreenView, ...eventsInDb]
    .filter((event): event is IServiceEvent => !!event)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
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

  const events = await getNecessarySessionEvents({
    projectId: payload.projectId,
    sessionId: payload.sessionId,
    createdAt: payload.createdAt,
  });

  const sessionStart = events.find((event) => event.name === 'session_start');
  const screenViews = events.filter((event) => event.name === 'screen_view');
  const lastEvent = events[0];

  if (!sessionStart) {
    throw new Error('No session_start found');
  }

  if (!lastEvent) {
    throw new Error('No last event found');
  }

  const sessionDuration =
    lastEvent.createdAt.getTime() - sessionStart.createdAt.getTime();

  await checkNotificationRulesForSessionEnd(events);

  logger.info('Creating session_end', {
    sessionStart,
    lastEvent,
    screenViews,
    sessionDuration,
    events,
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
