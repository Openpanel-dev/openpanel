import type {
  IClickhouseSession,
  IServiceCreateEventPayload,
} from '@openpanel/db';
import { SESSION_TIMEOUT_MS } from '@openpanel/db';
import { sessionsQueue } from '@openpanel/queue';

export { SESSION_TIMEOUT_MS };
export const SESSION_TIMEOUT = SESSION_TIMEOUT_MS;

/**
 * Deterministic v2 jobId for a closed session.
 *
 * Keyed on the session's stable `id` so concurrent / retried closes for the
 * same logical session dedupe in BullMQ. The `v2:` prefix lets the legacy
 * drain script differentiate from pre-migration delayed jobs.
 *
 * Format constraint: BullMQ only accepts ':' in custom jobIds when splitting
 * by ':' yields exactly 3 parts, so we keep the suffix as a single segment.
 * Cross-project sessionInternalId collisions would be astronomical given the
 * 128-bit hash used to generate them.
 */
export const getSessionEndJobIdV2 = (sessionInternalId: string) =>
  `sessionEnd:v2:${sessionInternalId}`;

/**
 * Enqueue a session_end job. Idempotent via jobId.
 *
 * Called when a boundary is detected during ingest (old session must close)
 * or by the reaper when a session has been idle past the timeout.
 */
export async function enqueueSessionEndV2({
  payload,
  closedSession,
}: {
  payload: IServiceCreateEventPayload;
  closedSession: IClickhouseSession;
}) {
  const jobId = getSessionEndJobIdV2(closedSession.id);

  return sessionsQueue.add(
    'session',
    {
      type: 'createSessionEnd',
      payload: {
        ...payload,
        projectId: closedSession.project_id,
        deviceId: closedSession.device_id,
        sessionId: closedSession.id,
        profileId: closedSession.profile_id || payload.profileId,
      },
      snapshot: closedSession,
    },
    {
      jobId,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 200,
      },
    }
  );
}
