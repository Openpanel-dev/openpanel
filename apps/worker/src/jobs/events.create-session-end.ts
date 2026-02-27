import {
  checkNotificationRulesForSessionEnd,
  convertClickhouseDateToJs,
  createEvent,
  formatClickhouseDate,
  getEvents,
  getHasFunnelRules,
  getNotificationRulesByProjectId,
  type IClickhouseSession,
  type IServiceCreateEventPayload,
  type IServiceEvent,
  profileBackfillBuffer,
  sessionBuffer,
  TABLE_NAMES,
  transformSessionToEvent,
} from '@openpanel/db';
import type { EventsQueuePayloadCreateSessionEnd } from '@openpanel/queue';
import type { Job } from 'bullmq';
import { logger as baseLogger } from '@/utils/logger';

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
}): Promise<IServiceEvent[]> {
  const sql = `
    SELECT * FROM ${TABLE_NAMES.events}
    WHERE
      session_id = '${sessionId}'
      AND project_id = '${projectId}'
      AND created_at BETWEEN '${formatClickhouseDate(new Date(startAt.getTime() - 1000))}' AND '${formatClickhouseDate(new Date(endAt.getTime() + 1000))}'
    ORDER BY created_at DESC LIMIT ${MAX_SESSION_EVENTS};
  `;

  const [lastScreenView, eventsInDb] = await Promise.all([
    sessionBuffer.getExistingSession({
      sessionId,
    }),
    getEvents(sql),
  ]);

  // sort last inserted first
  return [
    lastScreenView ? transformSessionToEvent(lastScreenView) : null,
    ...eventsInDb,
  ]
    .flatMap((event) => (event ? [event] : []))
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
}

export async function createSessionEnd(
  job: Job<EventsQueuePayloadCreateSessionEnd>
) {
  const { payload } = job.data;
  const logger = baseLogger.child({
    payload,
    jobId: job.id,
  });

  logger.debug('Processing session end job');

  const session = await sessionBuffer.getExistingSession({
    sessionId: payload.sessionId,
  });

  if (!session) {
    throw new Error('Session not found');
  }

  try {
    await handleSessionEndNotifications({
      session,
      payload,
    });
  } catch (error) {
    logger.error('Creating notificatios for session end failed', {
      error,
    });
  }

  const profileId = session.profile_id || payload.profileId;

  if (
    profileId !== session.device_id &&
    process.env.EXPERIMENTAL_PROFILE_BACKFILL === '1'
  ) {
    const runOnProjects =
      process.env.EXPERIMENTAL_PROFILE_BACKFILL_PROJECTS?.split(',').filter(
        Boolean
      ) ?? [];
    if (
      runOnProjects.length === 0 ||
      runOnProjects.includes(payload.projectId)
    ) {
      await profileBackfillBuffer.add({
        projectId: payload.projectId,
        sessionId: payload.sessionId,
        profileId,
      });
    }
  }

  // Create session end event
  return createEvent({
    ...payload,
    properties: {
      ...payload.properties,
      __bounce: session.is_bounce,
    },
    name: 'session_end',
    duration: session.duration ?? 0,
    path: session.exit_path ?? '',
    createdAt: new Date(
      convertClickhouseDateToJs(session.ended_at).getTime() + 1000
    ),
    profileId,
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
    payload.projectId
  );
  const hasFunnelRules = getHasFunnelRules(notificationRules);
  const isEventCountReasonable =
    session.event_count + session.screen_view_count < MAX_SESSION_EVENTS;

  if (hasFunnelRules && isEventCountReasonable) {
    const events = await getSessionEvents({
      projectId: payload.projectId,
      sessionId: payload.sessionId,
      startAt: convertClickhouseDateToJs(session.created_at),
      endAt: convertClickhouseDateToJs(session.ended_at),
    });

    if (events.length > 0) {
      await checkNotificationRulesForSessionEnd(events);
    }
  }
}
