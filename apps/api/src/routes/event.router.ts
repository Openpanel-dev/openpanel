import * as controller from '@/controllers/event.controller';
import type { FastifyPluginCallback } from 'fastify';

import { clientHook } from '@/hooks/client.hook';
import { isBotHook } from '@/hooks/is-bot.hook';

const eventRouter: FastifyPluginCallback = async (fastify) => {
  fastify.addHook('preHandler', clientHook);
  fastify.addHook('preHandler', isBotHook);

  fastify.route({
    method: 'POST',
    url: '/',
    handler: controller.postEvent,
  });
};

export default eventRouter;
