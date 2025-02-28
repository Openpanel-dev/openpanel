import { getLock } from '@openpanel/redis';
import fastJsonStableHash from 'fast-json-stable-hash';
import type { FastifyReply } from 'fastify';

export async function isDuplicatedEvent({
  payload,
  projectId,
}: {
  payload: Record<string, any>;
  projectId: string;
}) {
  const locked = await getLock(
    `fastify:deduplicate:${fastJsonStableHash.hash(
      {
        ...payload,
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

export async function checkDuplicatedEvent({
  reply,
  payload,
  projectId,
}: {
  reply: FastifyReply;
  payload: Record<string, any>;
  projectId: string;
}) {
  if (await isDuplicatedEvent({ payload, projectId })) {
    reply.log.info('duplicated event', {
      payload,
      projectId,
    });
    reply.status(200).send('duplicated');
    return true;
  }

  return false;
}
