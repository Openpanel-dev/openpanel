// The web SDK can fire the same event twice (pagehide + visibilitychange); a
// short-lived Redis lock keyed on the whole payload collapses the pair.
//
// That lock can't help a sender that retries after a timeout or a 5xx: the
// retry arrives seconds later, long after the 100 ms window. A sender that
// supplies its own event id gets a durable check instead. It runs after the
// client is authenticated, keyed on the resolved project, and an id only
// counts as used once its event has been accepted.

import { getLock, getRedisCache } from '@openpanel/redis';
import fastJsonStableHash from 'fast-json-stable-hash';

const DEDUPLICATE_KEY_PREFIX = 'fastify:deduplicate:';
const DEDUPLICATE_TTL_MS = 100;

const EVENT_ID_KEY_PREFIX = 'ingest:event-id:';
/** How long an accepted event id is remembered. */
export const EVENT_ID_TTL_MS = 24 * 60 * 60 * 1000;
/** How long an id is held while its event is being processed. */
export const EVENT_ID_PENDING_TTL_MS = 60 * 1000;

export async function isDuplicatedEvent({
  ip,
  origin,
  payload,
  projectId,
}: {
  ip: string;
  origin: string;
  payload: Record<string, unknown>;
  projectId: string;
}): Promise<boolean> {
  const locked = await getLock(
    `${DEDUPLICATE_KEY_PREFIX}${fastJsonStableHash.hash(
      { ...payload, ip, origin, projectId },
      'md5'
    )}`,
    '1',
    DEDUPLICATE_TTL_MS
  );

  return !locked;
}

const eventIdKey = (projectId: string, eventId: string) =>
  `${EVENT_ID_KEY_PREFIX}${projectId}:${eventId}`;

/**
 * Holds `eventId` for this project while its event is processed. False when
 * the id was already accepted, or another request is processing it now.
 */
export async function claimEventId(
  projectId: string,
  eventId: string
): Promise<boolean> {
  return await getLock(
    eventIdKey(projectId, eventId),
    'pending',
    EVENT_ID_PENDING_TTL_MS
  );
}

/** The event was accepted: remember the id for the full window. */
export async function confirmEventId(
  projectId: string,
  eventId: string
): Promise<void> {
  await getRedisCache().set(
    eventIdKey(projectId, eventId),
    'accepted',
    'PX',
    EVENT_ID_TTL_MS
  );
}

/** The attempt failed: free the id so a retry is processed. */
export async function releaseEventId(
  projectId: string,
  eventId: string
): Promise<void> {
  await getRedisCache().del(eventIdKey(projectId, eventId));
}
