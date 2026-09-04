// The jobId/payload/retry rules live in @openpanel/core now (M7-001):
// packages/core/src/modules/session/src/session-end.ts. This file stays
// (DELEGATE PATTERN) because V1's BullMQ `sessionsQueue` wire shape is
// `{ type: 'createSessionEnd', payload, snapshot }` — core's
// `legacyCompat.sessions` reads exactly that — and core cannot import
// `@openpanel/queue` (cycle), so the `.add()` itself stays here.
import type { EnqueueSessionEndInput } from '@openpanel/core';
import {
  getSessionEndJobId,
  sessionEndEnqueueOptions,
  sessionEndJobPayload,
} from '@openpanel/core';
import { SESSION_TIMEOUT_MS } from '@openpanel/db';
import { sessionsQueue } from '@openpanel/queue';

export { SESSION_TIMEOUT_MS } from '@openpanel/db';
export const SESSION_TIMEOUT = SESSION_TIMEOUT_MS;

export const getSessionEndJobIdV2 = getSessionEndJobId;

/**
 * Enqueue a session_end job. Idempotent via jobId.
 *
 * Called when a boundary is detected during ingest (old session must close)
 * or by the reaper when a session has been idle past the timeout.
 */
export async function enqueueSessionEndV2(input: EnqueueSessionEndInput) {
  const { event, snapshot } = sessionEndJobPayload(input);

  return sessionsQueue.add(
    'session',
    { type: 'createSessionEnd', payload: event, snapshot },
    sessionEndEnqueueOptions(input.closedSession.id)
  );
}
