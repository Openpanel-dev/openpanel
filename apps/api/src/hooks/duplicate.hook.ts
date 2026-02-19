import type {
  DeprecatedPostEventPayload,
  ITrackHandlerPayload,
} from '@openpanel/validation';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { isDuplicatedEvent } from '@/utils/deduplicate';

export async function duplicateHook(
  req: FastifyRequest<{
    Body: ITrackHandlerPayload | DeprecatedPostEventPayload;
  }>,
  reply: FastifyReply
) {
  const ip = req.clientIp;
  const origin = req.headers.origin;
  const clientId = req.headers['openpanel-client-id'];
  const shouldCheck = ip && origin && clientId && req.body.type !== 'replay';

  const isDuplicate = shouldCheck
    ? await isDuplicatedEvent({
        ip,
        origin,
        payload: req.body,
        projectId: clientId as string,
      })
    : false;

  console.log('Duplicate event', isDuplicate);
  if (isDuplicate) {
    return reply.status(200).send('Duplicate event');
  }
}
