// The web SDK can fire the same event twice (pagehide + visibilitychange); a
// short-lived Redis lock keyed on the whole payload collapses the pair.

import { getLock } from '@openpanel/redis';
import fastJsonStableHash from 'fast-json-stable-hash';

const DEDUPLICATE_KEY_PREFIX = 'fastify:deduplicate:';
const DEDUPLICATE_TTL_MS = 100;

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
