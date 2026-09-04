import { checkIngestBot } from '@openpanel/core';
import type {
  DeprecatedPostEventPayload,
  ITrackHandlerPayload,
} from '@openpanel/validation';
import type { FastifyReply, FastifyRequest } from 'fastify';

// Delegates to @openpanel/core's ingest module (M8-002), which owns the
// client-secret exemption, the bot lookup and the bot-event write.
export async function isBotHook(
  req: FastifyRequest<{
    Body: ITrackHandlerPayload | DeprecatedPostEventPayload;
  }>,
  reply: FastifyReply
) {
  const bot = await checkIngestBot({
    headers: req.headers,
    clientSecretAuth: req.clientSecretAuth ?? false,
    projectId: req.client?.projectId,
    body: req.body,
  });

  if (bot) {
    return reply.status(202).send({ bot });
  }
}
