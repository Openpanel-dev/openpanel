// Ported from apps/worker/src/jobs/events.create-session-end.ts and
// utils/session-handler.ts (M7-001). The worker's copies are thin delegates
// onto this file until apps/worker dies (P9).

import type { EnqueueOptions } from '../../../jobs/define';
import type { Logger } from '../../../logger';
// Static, not lazy like the db imports below: core's event.service touches no
// client at import time, and a dynamic edge here closes a dynamic-import cycle
// (event.service ⇢ session.service → this file) that panics rolldown when
// apps/worker bundles the workspace.
import {
  createEvent,
  type IClickhouseEvent,
  type IServiceCreateEventPayload,
  type IServiceEvent,
  transformEvent,
  transformSessionToEvent,
} from '../../event/event.service';
import type { INotificationRuleCached } from '../../notification/notification.service';
import type { IClickhouseSession } from '../session.service';
import { convertClickhouseDateToJs } from './dates';
import type { SessionRuntime } from './runtime';
import {
  sessionDurationOnClose,
  sessionEndsEmitted,
  sessionEndsSkipped,
  sessionEventsOnClose,
} from './session.metrics';
import { sessionEventsQuery } from './session.sql';

const SESSION_END_JOB_ID_PREFIX = 'sessionEnd:v2';
const SESSION_END_ATTEMPTS = 3;
const SESSION_END_BACKOFF_MS = 200;

/** Funnel rules are not evaluated for sessions longer than this. */
const MAX_SESSION_EVENTS = 500;
/** 2h — well past any plausible retry window. */
const SESSION_END_CLAIM_TTL_SECONDS = 60 * 60 * 2;
/** The events query pads the session's own bounds by this much on each side. */
const SESSION_EVENTS_WINDOW_PADDING_MS = 1000;
/** The session_end event lands one second after the last event. */
const SESSION_END_OFFSET_MS = 1000;

const PROFILE_BACKFILL_FLAG_ENV = 'EXPERIMENTAL_PROFILE_BACKFILL';
const PROFILE_BACKFILL_PROJECTS_ENV = 'EXPERIMENTAL_PROFILE_BACKFILL_PROJECTS';

/**
 * Deterministic jobId for a closed session, so concurrent / retried closes
 * dedupe in BullMQ. BullMQ only accepts ':' in custom jobIds when splitting
 * by ':' yields exactly 3 parts, so the suffix stays a single segment.
 */
export function getSessionEndJobId(sessionId: string): string {
  return `${SESSION_END_JOB_ID_PREFIX}:${sessionId}`;
}

export function sessionEndEnqueueOptions(sessionId: string): EnqueueOptions {
  return {
    jobId: getSessionEndJobId(sessionId),
    attempts: SESSION_END_ATTEMPTS,
    backoff: { type: 'exponential', delay: SESSION_END_BACKOFF_MS },
  };
}

export interface EnqueueSessionEndInput {
  payload: IServiceCreateEventPayload;
  closedSession: IClickhouseSession;
}

/** What rides on the `sessions` queue (legacyCompat.sessions: `{ event, snapshot }`). */
export interface SessionEndJobData {
  event: IServiceCreateEventPayload;
  snapshot: IClickhouseSession;
}

export function sessionEndJobPayload({
  payload,
  closedSession,
}: EnqueueSessionEndInput): SessionEndJobData {
  return {
    event: {
      ...payload,
      projectId: closedSession.project_id,
      deviceId: closedSession.device_id,
      sessionId: closedSession.id,
      profileId: closedSession.profile_id || payload.profileId,
    },
    snapshot: closedSession,
  };
}

/** The bits of @openpanel/db the emission needs beyond the shared runtime. */
export interface SessionEndDeps extends SessionRuntime {
  logger: Logger;
  createEvent(
    payload: IServiceCreateEventPayload
  ): Promise<{ document: IClickhouseEvent }>;
  transformEvent(event: IClickhouseEvent): IServiceEvent;
  transformSessionToEvent(session: IClickhouseSession): IServiceEvent;
  getEvents(
    query: ReturnType<typeof sessionEventsQuery>
  ): Promise<IServiceEvent[]>;
  profileBackfill: {
    add(entry: {
      projectId: string;
      sessionId: string;
      profileId: string;
    }): Promise<unknown>;
  };
  notifications: {
    getRules(projectId: string): Promise<INotificationRuleCached[]>;
    hasFunnelRules(rules: INotificationRuleCached[]): boolean;
    /** Stays in @openpanel/db — it enqueues through @openpanel/queue. */
    checkFunnelRules(events: IServiceEvent[]): Promise<unknown>;
  };
}

export async function loadSessionEndDeps(
  runtime: SessionRuntime,
  logger: Logger
): Promise<SessionEndDeps> {
  const [
    { chQuery },
    { profileBackfillBuffer },
    notificationService,
    { checkNotificationRulesForSessionEnd },
  ] = await Promise.all([
    import('@openpanel/db/src/clickhouse/client'),
    import('@openpanel/db/src/buffers'),
    import('../../notification/notification.service'),
    import('@openpanel/db/src/services/notification.service'),
  ]);
  return {
    ...runtime,
    logger,
    createEvent,
    transformEvent,
    transformSessionToEvent,
    getEvents: async (query) =>
      (await chQuery<IClickhouseEvent>(query)).map(transformEvent),
    profileBackfill: profileBackfillBuffer,
    notifications: {
      getRules: notificationService.getNotificationRulesByProjectId,
      hasFunnelRules: notificationService.getHasFunnelRules,
      checkFunnelRules: checkNotificationRulesForSessionEnd,
    },
  };
}

function claimKey(session: IClickhouseSession): string {
  return `session:end:emitted:${session.project_id}:${session.device_id}:${session.id}`;
}

function isProfileBackfillEnabled(projectId: string): boolean {
  if (process.env[PROFILE_BACKFILL_FLAG_ENV] !== '1') {
    return false;
  }
  const runOnProjects =
    process.env[PROFILE_BACKFILL_PROJECTS_ENV]?.split(',').filter(Boolean) ??
    [];
  return runOnProjects.length === 0 || runOnProjects.includes(projectId);
}

/**
 * Emit the `session_end` event for a closed session. Returns the written
 * event, or null when nothing was emitted (extended, gone, or already done).
 */
export async function createSessionEnd(
  { event: payload, snapshot }: SessionEndJobData,
  deps: SessionEndDeps
): Promise<IClickhouseEvent | null> {
  const { logger } = deps;

  // Prefer the live blob — it reflects any late extensions that arrived after
  // enqueue. Fall back to the snapshot if the blob expired (very long queue
  // lag, retries hours later, etc.).
  const live = await deps.sessions.getExistingSession({
    projectId: payload.projectId,
    deviceId: payload.deviceId,
  });

  // Same session, extended after enqueue → bail, the reaper retries later.
  // Same session, unchanged → live. A different session in the slot (boundary)
  // or no blob at all → the snapshot; cleanup is then id-gated to a no-op.
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
      'session was extended after close was enqueued, skipping'
    );
    return null;
  }

  const session = sameSession ? live : snapshot;
  if (!session) {
    sessionEndsSkipped.inc({ reason: 'not_found' });
    logger.warn(
      { projectId: payload.projectId, deviceId: payload.deviceId },
      'No live session and no snapshot — skipping session_end'
    );
    return null;
  }

  // Idempotency claim: first writer wins; retries and reaper double-fires no-op.
  const claimed = await deps.redis.set(
    claimKey(session),
    '1',
    'EX',
    SESSION_END_CLAIM_TTL_SECONDS,
    'NX'
  );
  if (claimed === null) {
    sessionEndsSkipped.inc({ reason: 'already_emitted' });
    logger.info(
      { sessionId: session.id, projectId: session.project_id },
      'session_end already emitted, skipping'
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
    isProfileBackfillEnabled(payload.projectId)
  ) {
    await deps.profileBackfill.add({
      projectId: payload.projectId,
      sessionId: session.id,
      profileId,
    });
  }

  const { document: sessionEndEvent } = await deps.createEvent({
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
      convertClickhouseDateToJs(session.ended_at).getTime() +
        SESSION_END_OFFSET_MS
    ),
    profileId,
  });

  try {
    await notifyFunnelRules(
      session,
      payload.projectId,
      deps.transformEvent(sessionEndEvent),
      deps
    );
  } catch (error) {
    logger.error(
      { err: error },
      'Creating notificatios for session end failed'
    );
  }

  await deps.sessions
    .cleanup({
      projectId: session.project_id,
      deviceId: session.device_id,
      sessionId: session.id,
      profileId: session.profile_id,
    })
    .catch((error) => {
      logger.error(
        { err: error, sessionId: session.id },
        'Failed to cleanup session state after session_end'
      );
    });

  return sessionEndEvent;
}

async function notifyFunnelRules(
  session: IClickhouseSession,
  projectId: string,
  sessionEndEvent: IServiceEvent,
  deps: SessionEndDeps
): Promise<void> {
  const rules = await deps.notifications.getRules(projectId);
  const isEventCountReasonable =
    session.event_count + session.screen_view_count < MAX_SESSION_EVENTS;

  if (!(deps.notifications.hasFunnelRules(rules) && isEventCountReasonable)) {
    return;
  }

  const events = await getSessionEvents(session, deps);
  if (events.length > 0) {
    await deps.notifications.checkFunnelRules([...events, sessionEndEvent]);
  }
}

/** The session's events plus its own exit page, newest first. */
async function getSessionEvents(
  session: IClickhouseSession,
  deps: SessionEndDeps
): Promise<IServiceEvent[]> {
  const startAt = convertClickhouseDateToJs(session.created_at);
  const endAt = convertClickhouseDateToJs(session.ended_at);
  const eventsInDb = await deps.getEvents(
    sessionEventsQuery({
      sessionId: session.id,
      projectId: session.project_id,
      startAt: new Date(startAt.getTime() - SESSION_EVENTS_WINDOW_PADDING_MS),
      endAt: new Date(endAt.getTime() + SESSION_EVENTS_WINDOW_PADDING_MS),
      limit: MAX_SESSION_EVENTS,
    })
  );

  return [deps.transformSessionToEvent(session), ...eventsInDb].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
