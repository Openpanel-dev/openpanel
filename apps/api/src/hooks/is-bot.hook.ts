import { createBotEvent } from '@openpanel/db';
import type {
  DeprecatedPostEventPayload,
  ITrackHandlerPayload,
} from '@openpanel/validation';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { isBot } from '@/bots';

export async function isBotHook(
  req: FastifyRequest<{
    Body: ITrackHandlerPayload | DeprecatedPostEventPayload;
  }>,
  reply: FastifyReply
) {
  // Requests authenticated with a client secret come from server-side SDKs
  // (node, php, go, rust, java, python, …). That auth is a far stronger signal
  // of legitimate first-party traffic than the user agent, so never treat them
  // as bots — bot detection is for public/frontend (origin-authenticated)
  // traffic.
  if (req.clientSecretAuth) {
    return;
  }

  const bot = req.headers['user-agent']
    ? await isBot(req.headers['user-agent'])
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

    return reply.status(202).send({ bot });
  }
}
