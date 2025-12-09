import { isDuplicatedEvent } from '@/utils/deduplicate';
import type { PostEventPayload, TrackHandlerPayload } from '@openpanel/sdk';
import type { FastifyReply, FastifyRequest } from 'fastify';

export async function duplicateHook(
  req: FastifyRequest<{
    Body: PostEventPayload | TrackHandlerPayload;
  }>,
  reply: FastifyReply,
) {
  const ip = req.clientIp;
  const origin = req.headers.origin;
  const clientId = req.headers['openpanel-client-id'];
  const shouldCheck = ip && origin && clientId;

  const isDuplicate = shouldCheck
    ? await isDuplicatedEvent({
        ip,
        origin,
        payload: req.body,
        projectId: clientId as string,
      })
    : false;

  if (isDuplicate) {
    return reply.status(200).send('Duplicate event');
  }
}
