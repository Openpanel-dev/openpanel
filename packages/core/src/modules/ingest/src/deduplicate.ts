// The web SDK can fire the same event twice (pagehide + visibilitychange); a
// short-lived Redis lock keyed on the whole payload collapses the pair.
//
// That lock can't help a sender that retries after a timeout or a 5xx: the
// retry arrives seconds later, long after the 100 ms window. A sender that
// supplies its own event id gets a durable check instead. It runs after the
// client is authenticated, keyed on the resolved project, and an id only
// counts as used once its event has been accepted.

import { randomUUID } from 'node:crypto';
import { getLock, getRedisCache } from '@openpanel/redis';
import fastJsonStableHash from 'fast-json-stable-hash';

const DEDUPLICATE_KEY_PREFIX = 'fastify:deduplicate:';
const DEDUPLICATE_TTL_MS = 100;

const EVENT_ID_KEY_PREFIX = 'ingest:event-id:';
/** How long an accepted event id is remembered. */
export const EVENT_ID_TTL_MS = 24 * 60 * 60 * 1000;
/**
 * How long an id is held while its event is processed. Far longer than the
 * producer's request timeout (5 s by default), so a claim can't expire under a
 * request that is still running.
 */
export const EVENT_ID_CLAIM_TTL_MS = 10 * 60 * 1000;

// Both scripts act only while the key still holds this request's token, so a
// request can never overwrite or delete a claim another request now owns.
const ACCEPTED = 'accepted';
const CONFIRM_IF_OWNER = `if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('SET', KEYS[1], '${ACCEPTED}', 'PX', ARGV[2])
end
return false`;
const RELEASE_IF_OWNER = `if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0`;

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
 * Holds `eventId` for this project while its event is processed. Returns the
 * claim token, or null when the id was already accepted or another request is
 * processing it now.
 */
export async function claimEventId(
  projectId: string,
  eventId: string
): Promise<string | null> {
  const token = randomUUID();
  const claimed = await getLock(
    eventIdKey(projectId, eventId),
    token,
    EVENT_ID_CLAIM_TTL_MS
  );
  return claimed ? token : null;
}

/** Whether a held id belongs to an accepted event or one still in flight. */
export async function eventIdState(
  projectId: string,
  eventId: string
): Promise<'accepted' | 'in-progress'> {
  const value = await getRedisCache().get(eventIdKey(projectId, eventId));
  return value === ACCEPTED ? 'accepted' : 'in-progress';
}

/** The event was accepted: remember the id for the full window. */
export async function confirmEventId(
  projectId: string,
  eventId: string,
  token: string
): Promise<void> {
  await getRedisCache().eval(
    CONFIRM_IF_OWNER,
    1,
    eventIdKey(projectId, eventId),
    token,
    String(EVENT_ID_TTL_MS)
  );
}

/** The attempt failed: free the id so a retry is processed. */
export async function releaseEventId(
  projectId: string,
  eventId: string,
  token: string
): Promise<void> {
  await getRedisCache().eval(
    RELEASE_IF_OWNER,
    1,
    eventIdKey(projectId, eventId),
    token
  );
}
