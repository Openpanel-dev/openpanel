import { getLock } from '@openpanel/redis';
import fastJsonStableHash from 'fast-json-stable-hash';
import type { FastifyReply, FastifyRequest } from 'fastify';

export async function deduplicateHook(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (typeof request.body === 'object') {
    const locked = await getLock(
      `fastify:deduplicate:${fastJsonStableHash.hash(request.body, 'md5')}`,
      '1',
      100,
    );

    if (locked) {
      return;
    }
  }
  reply.status(200).send('Duplicated event');
}
