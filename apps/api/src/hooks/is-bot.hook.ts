import { isBot } from '@/bots';
import { createBotEvent } from '@openpanel/db';
import type { TrackHandlerPayload } from '@openpanel/sdk';
import type { FastifyReply, FastifyRequest } from 'fastify';

type DeprecatedEventPayload = {
  name: string;
  properties: Record<string, unknown>;
  timestamp: string;
};

export async function isBotHook(
  req: FastifyRequest<{
    Body: TrackHandlerPayload | DeprecatedEventPayload;
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

    return reply.status(202).send('OK');
  }
}
