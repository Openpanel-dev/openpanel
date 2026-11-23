// The web SDK can fire the same event twice (pagehide + visibilitychange); a
// short-lived Redis lock keyed on the whole payload collapses the pair.
//
// That lock can't help a sender that retries after a timeout or a 5xx: the
// retry arrives seconds later, long after the 100 ms window. A sender that
// supplies its own event id gets a durable check instead, keyed on
// (project, id), so a retry within EVENT_ID_TTL_MS is acknowledged without
// being stored a second time.

import { getLock } from '@openpanel/redis';
import fastJsonStableHash from 'fast-json-stable-hash';

const DEDUPLICATE_KEY_PREFIX = 'fastify:deduplicate:';
const DEDUPLICATE_TTL_MS = 100;

const EVENT_ID_KEY_PREFIX = 'ingest:event-id:';
/** How long a client-supplied event id is remembered. */
export const EVENT_ID_TTL_MS = 24 * 60 * 60 * 1000;

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

/** True when this project has already accepted an event with this id. */
export async function isDuplicatedEventId({
  eventId,
  projectId,
}: {
  eventId: string;
  projectId: string;
}): Promise<boolean> {
  const locked = await getLock(
    `${EVENT_ID_KEY_PREFIX}${projectId}:${eventId}`,
    '1',
    EVENT_ID_TTL_MS
  );

  return !locked;
}
