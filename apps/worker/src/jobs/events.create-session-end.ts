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
  transformEvent,
  transformSessionToEvent,
} from '@openpanel/db';
import type { EventsQueuePayloadCreateSessionEnd } from '@openpanel/queue';
import { getRedisCache } from '@openpanel/redis';
import type { Job } from 'bullmq';
import { logger as baseLogger } from '@/utils/logger';
import {
  sessionDurationOnClose,
  sessionEndsEmitted,
  sessionEndsSkipped,
  sessionEventsOnClose,
} from '@/metrics';

const MAX_SESSION_EVENTS = 500;
const SESSION_END_CLAIM_TTL = 60 * 60 * 2; // 2h, well past any plausible retry window

async function getSessionEvents({
  session,
  startAt,
  endAt,
}: {
  session: IClickhouseSession;
  startAt: Date;
  endAt: Date;
}): Promise<IServiceEvent[]> {
  const sql = `
    SELECT * FROM ${TABLE_NAMES.events}
    WHERE
      session_id = '${session.id}'
      AND project_id = '${session.project_id}'
      AND created_at BETWEEN '${formatClickhouseDate(new Date(startAt.getTime() - 1000))}' AND '${formatClickhouseDate(new Date(endAt.getTime() + 1000))}'
    ORDER BY created_at DESC LIMIT ${MAX_SESSION_EVENTS};
  `;

  const eventsInDb = await getEvents(sql);

  return [transformSessionToEvent(session), ...eventsInDb]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
}

export async function createSessionEnd(
  job: Job<EventsQueuePayloadCreateSessionEnd>
) {
  const { payload, snapshot } = job.data;
  const logger = baseLogger.child({
    payload,
    jobId: job.id,
  });

  logger.debug('Processing session end job');

  // Prefer the live blob — it reflects any late extensions that arrived after
  // enqueue. Fall back to the snapshot if the blob expired (very long queue
  // lag, retries hours later, etc.).
  const live = await sessionBuffer.getExistingSession({
    projectId: payload.projectId,
    deviceId: payload.deviceId,
  });

  // Distinguish three cases:
  //  - Same session, extended after enqueue → bail. Reaper will retry later.
  //  - Same session, no change                → use live (snapshot equivalent).
  //  - Different session in slot (boundary)   → use snapshot for emission;
  //    cleanup will be a no-op since the slot is owned by the new session.
  //  - No live blob at all (TTL expired)      → use snapshot.
  const sameSession = live && live.id === snapshot.id;
  if (sameSession && live.ended_at > snapshot.ended_at) {
    sessionEndsSkipped.inc({ reason: 'extended_after_enqueue' });
    logger.info(
      {
        sessionId: live.id,
        projectId: live.project_id,
        snapshotEndedAt: snapshot.ended_at,
        liveEndedAt: live.ended_at,
      },
      'session was extended after close was enqueued, skipping',
    );
    return null;
  }

  const session = sameSession ? live : snapshot;
  if (!session) {
    sessionEndsSkipped.inc({ reason: 'not_found' });
    logger.warn(
      { projectId: payload.projectId, deviceId: payload.deviceId },
      'No live session and no snapshot — skipping session_end',
    );
    return null;
  }

  // Idempotency claim: first writer wins. Subsequent retries / reaper
  // double-fires are no-ops.
  const redis = getRedisCache();
  const claimKey = `session:end:emitted:${session.project_id}:${session.device_id}:${session.id}`;
  const claimed = await redis.set(claimKey, '1', 'EX', SESSION_END_CLAIM_TTL, 'NX');
  if (claimed === null) {
    sessionEndsSkipped.inc({ reason: 'already_emitted' });
    logger.info(
      { sessionId: session.id, projectId: session.project_id },
      'session_end already emitted, skipping',
    );
    return null;
  }

  sessionEndsEmitted.inc();
  sessionDurationOnClose.observe(Math.max(0, session.duration ?? 0));
  sessionEventsOnClose.observe(
    (session.event_count ?? 0) + (session.screen_view_count ?? 0)
  );

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
        sessionId: session.id,
        profileId,
      });
    }
  }

  // Create session end event
  const { document: sessionEndEvent } = await createEvent({
    ...payload,
    sessionId: session.id,
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

  try {
    await handleSessionEndNotifications({
      session,
      payload,
      sessionEndEvent: transformEvent(sessionEndEvent),
    });
  } catch (error) {
    logger.error(
      { err: error },
      'Creating notificatios for session end failed',
    );
  }

  // Clean up Redis state for this session. cleanup() is id-gated — if a new
  // session has already taken over this (projectId, deviceId) slot via a
  // boundary, the call is a no-op and the new session is preserved.
  await sessionBuffer
    .cleanup({
      projectId: session.project_id,
      deviceId: session.device_id,
      sessionId: session.id,
      profileId: session.profile_id,
    })
    .catch((error) => {
      logger.error(
        { err: error, sessionId: session.id },
        'Failed to cleanup session state after session_end',
      );
    });

  return sessionEndEvent;
}

async function handleSessionEndNotifications({
  session,
  payload,
  sessionEndEvent,
}: {
  session: IClickhouseSession;
  payload: IServiceCreateEventPayload;
  sessionEndEvent: IServiceEvent;
}) {
  const notificationRules = await getNotificationRulesByProjectId(
    payload.projectId
  );
  const hasFunnelRules = getHasFunnelRules(notificationRules);
  const isEventCountReasonable =
    session.event_count + session.screen_view_count < MAX_SESSION_EVENTS;

  if (hasFunnelRules && isEventCountReasonable) {
    const events = await getSessionEvents({
      session,
      startAt: convertClickhouseDateToJs(session.created_at),
      endAt: convertClickhouseDateToJs(session.ended_at),
    });

    if (events.length > 0) {
      await checkNotificationRulesForSessionEnd([...events, sessionEndEvent]);
    }
  }
}
