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
  const body = req?.body;
  const isTrackPayload = getIsTrackPayload(req);
  const isReplay = isTrackPayload && req.body.type === 'replay';
  const shouldCheck = ip && origin && clientId && !isReplay;
  const isDuplicate = shouldCheck
    ? await isDuplicatedEvent({
        ip,
        origin,
        payload: body,
        projectId: clientId as string,
      })
    : false;

  if (isDuplicate) {
    return reply.status(200).send('Duplicate event');
  }
}

function getIsTrackPayload(
  req: FastifyRequest<{
    Body: ITrackHandlerPayload | DeprecatedPostEventPayload;
  }>
): req is FastifyRequest<{
  Body: ITrackHandlerPayload;
}> {
  if (req.method !== 'POST') {
    return false;
  }

  if (!req.body) {
    return false;
  }

  if (typeof req.body !== 'object' || Array.isArray(req.body)) {
    return false;
  }

  return 'type' in req.body;
}
