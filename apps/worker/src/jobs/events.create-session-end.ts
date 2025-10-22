import type { Job } from 'bullmq';

import { logger as baseLogger } from '@/utils/logger';
import { getTime } from '@openpanel/common';
import {
  type IClickhouseSession,
  type IServiceCreateEventPayload,
  type IServiceEvent,
  TABLE_NAMES,
  checkNotificationRulesForSessionEnd,
  createEvent,
  eventBuffer,
  formatClickhouseDate,
  getEvents,
  getHasFunnelRules,
  getNotificationRulesByProjectId,
  sessionBuffer,
} from '@openpanel/db';
import type { EventsQueuePayloadCreateSessionEnd } from '@openpanel/queue';

const MAX_SESSION_EVENTS = 500;

// Grabs session_start and screen_views + the last occured event
async function getSessionEvents({
  projectId,
  sessionId,
  startAt,
  endAt,
}: {
  projectId: string;
  sessionId: string;
  startAt: Date;
  endAt: Date;
}): Promise<ReturnType<typeof getEvents>> {
  const sql = `
    SELECT * FROM ${TABLE_NAMES.events} 
    WHERE 
      session_id = '${sessionId}' 
      AND project_id = '${projectId}'
      AND created_at BETWEEN '${formatClickhouseDate(startAt)}' AND '${formatClickhouseDate(endAt)}'
    ORDER BY created_at DESC LIMIT ${MAX_SESSION_EVENTS};
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
  const { payload } = job.data;
  const logger = baseLogger.child({
    payload,
    jobId: job.id,
    reqId: payload.properties?.__reqId ?? 'unknown',
  });

  logger.debug('Processing session end job');

  const session = await sessionBuffer.getExistingSession(payload.sessionId);

  if (!session) {
    throw new Error('Session not found');
  }

  try {
    handleSessionEndNotifications({
      session,
      payload,
    });
  } catch (error) {
    logger.error('Creating notificatios for session end failed', {
      error,
    });
  }

  const lastScreenView = await eventBuffer.getLastScreenView({
    projectId: payload.projectId,
    sessionId: payload.sessionId,
  });

  // Create session end event
  return createEvent({
    ...payload,
    properties: {
      ...payload.properties,
      ...(lastScreenView?.properties ?? {}),
      __bounce: session.is_bounce,
    },
    name: 'session_end',
    duration: session.duration ?? 0,
    path: lastScreenView?.path ?? '',
    createdAt: new Date(getTime(session.ended_at) + 1000),
    profileId: lastScreenView?.profileId || payload.profileId,
  });
}

async function handleSessionEndNotifications({
  session,
  payload,
}: {
  session: IClickhouseSession;
  payload: IServiceCreateEventPayload;
}) {
  const notificationRules = await getNotificationRulesByProjectId(
    payload.projectId,
  );
  const hasFunnelRules = getHasFunnelRules(notificationRules);
  const isEventCountReasonable =
    session.event_count + session.screen_view_count < MAX_SESSION_EVENTS;

  if (hasFunnelRules && isEventCountReasonable) {
    const events = await getSessionEvents({
      projectId: payload.projectId,
      sessionId: payload.sessionId,
      startAt: new Date(session.created_at),
      endAt: new Date(session.ended_at),
    });

    if (events.length > 0) {
      await checkNotificationRulesForSessionEnd(events);
    }
  }
}
