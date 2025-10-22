import { getLock } from '@openpanel/redis';
import fastJsonStableHash from 'fast-json-stable-hash';

export async function isDuplicatedEvent({
  ip,
  origin,
  payload,
  projectId,
}: {
  ip: string;
  origin: string;
  payload: Record<string, any>;
  projectId: string;
}) {
  const locked = await getLock(
    `fastify:deduplicate:${fastJsonStableHash.hash(
      {
        ...payload,
        ip,
        origin,
        projectId,
      },
      'md5',
    )}`,
    '1',
    100,
  );

  if (locked) {
    return false;
  }

  return true;
}
