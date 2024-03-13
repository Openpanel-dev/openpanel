import { isBot } from '@/bots';
import * as controller from '@/controllers/event.controller';
import { validateSdkRequest } from '@/utils/auth';
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
        const projectId = await validateSdkRequest(req.headers);
        req.projectId = projectId;

        const bot = req.headers['user-agent']
          ? isBot(req.headers['user-agent'])
          : null;

        if (bot) {
          const path = (req.body?.properties?.__path ||
            req.body?.properties?.path) as string | undefined;
          req.log.warn({ ...req.headers, bot }, 'Bot detected (event)');
          await createBotEvent({
            ...bot,
            projectId,
            path: path ?? '',
            createdAt: new Date(req.body?.timestamp),
          });
          reply.status(202).send('OK');
        }
      } catch (e) {
        req.log.error(e, 'Failed to create bot event');
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
  fastify.route({
    method: 'GET',
    url: '/',
    handler: controller.postEvent,
  });
  done();
};

export default eventRouter;
