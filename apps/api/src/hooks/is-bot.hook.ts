import { isBot } from '@/bots';
import { createBotEvent } from '@openpanel/db';
import type {
  DeprecatedPostEventPayload,
  ITrackHandlerPayload,
} from '@openpanel/validation';

import type { FastifyReply, FastifyRequest } from 'fastify';

export async function isBotHook(
  req: FastifyRequest<{
    Body: ITrackHandlerPayload | DeprecatedPostEventPayload;
  }>,
  reply: FastifyReply,
) {
  const bot = req.headers['user-agent']
    ? isBot(req.headers['user-agent'])
    : null;

  if (bot && req.client?.projectId) {
    if ('type' in req.body && req.body.type === 'track') {
      const path = (req.body.payload.properties?.__path ||
        req.body.payload.properties?.path) as string | undefined;
      if (path) {
        await createBotEvent({
          ...bot,
          projectId: req.client.projectId,
          path: path ?? '',
          createdAt: new Date(),
        });
      }
      // Handle deprecated events (v1)
    } else if ('name' in req.body && 'properties' in req.body) {
      const path = (req.body.properties?.__path || req.body.properties?.path) as
        | string
        | undefined;
      if (path) {
        await createBotEvent({
          ...bot,
          projectId: req.client.projectId,
          path: path ?? '',
          createdAt: new Date(),
        });
      }
    }

    return reply.status(202).send();
  }
}
