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
 * Includes the session's stable `id` so concurrent / retried closes for the
 * same logical session dedupe in BullMQ. The `v2:` prefix lets the legacy
 * drain script differentiate from pre-migration delayed jobs.
 */
export const getSessionEndJobIdV2 = (
  projectId: string,
  deviceId: string,
  sessionInternalId: string
) => `sessionEnd:v2:${projectId}:${deviceId}:${sessionInternalId}`;

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
  const jobId = getSessionEndJobIdV2(
    closedSession.project_id,
    closedSession.device_id,
    closedSession.id
  );

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
