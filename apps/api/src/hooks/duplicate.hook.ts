import { isDuplicateIngestRequest } from '@openpanel/core';
import type {
  DeprecatedPostEventPayload,
  ITrackHandlerPayload,
} from '@openpanel/validation';
import type { FastifyReply, FastifyRequest } from 'fastify';

// Delegates to @openpanel/core's ingest module (M8-002).
export async function duplicateHook(
  req: FastifyRequest<{
    Body: ITrackHandlerPayload | DeprecatedPostEventPayload;
  }>,
  reply: FastifyReply
) {
  const isDuplicate = await isDuplicateIngestRequest({
    method: req.method,
    clientIp: req.clientIp,
    headers: req.headers,
    body: req.body,
  });

  if (isDuplicate) {
    return reply.status(200).send('Duplicate event');
  }
}
