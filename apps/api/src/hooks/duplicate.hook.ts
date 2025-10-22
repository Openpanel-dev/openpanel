import { isDuplicatedEvent } from '@/utils/deduplicate';
import type { PostEventPayload, TrackHandlerPayload } from '@openpanel/sdk';
import type { FastifyReply, FastifyRequest } from 'fastify';

export async function duplicateHook(
  req: FastifyRequest<{
    Body: PostEventPayload | TrackHandlerPayload;
  }>,
  reply: FastifyReply,
) {
  const isDuplicate = await isDuplicatedEvent({
    ip: req.clientIp ?? '',
    origin: req.headers.origin ?? '',
    payload: req.body,
    projectId: (req.headers['openpanel-client-id'] as string) || '',
  });

  if (isDuplicate) {
    return reply.status(200).send('Duplicate event');
  }
}
