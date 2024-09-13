import { isBot } from '@/bots';
import * as controller from '@/controllers/event.controller';
import { SdkAuthError, validateSdkRequest } from '@/utils/auth';
import { logger } from '@/utils/logger';
import type { FastifyPluginCallback, FastifyRequest } from 'fastify';

import { createBotEvent } from '@openpanel/db';
import type { PostEventPayload } from '@openpanel/sdk';

const eventRouter: FastifyPluginCallback = (fastify, opts, done) => {
  fastify.addHook(
    'preHandler',
    async (
      req: FastifyRequest<{
        Body: PostEventPayload;
      }>,
      reply
    ) => {
      try {
        const client = await validateSdkRequest(req.headers).catch((error) => {
          if (error instanceof SdkAuthError) {
            return reply.status(401).send(error.message);
          }
          logger.error('Failed to validate sdk request', { error });
          return reply.status(401).send('Unknown validation error');
        });

        if (!client?.projectId) {
          return reply.status(401).send('No project found for this client');
        }
        req.projectId = client.projectId;
        req.client = client;

        const bot = req.headers['user-agent']
          ? isBot(req.headers['user-agent'])
          : null;

        if (bot) {
          const path = (req.body?.properties?.__path ||
            req.body?.properties?.path) as string | undefined;
          await createBotEvent({
            ...bot,
            projectId: client.projectId,
            path: path ?? '',
            createdAt: new Date(req.body?.timestamp),
          });
          reply.status(202).send('OK');
        }
      } catch (error) {
        logger.error('Failed to create bot event', { error });
        reply.status(401).send();
        return;
      }
    }
  );

  fastify.route({
    method: 'POST',
    url: '/',
    handler: controller.postEvent,
  });
  done();
};

export default eventRouter;
