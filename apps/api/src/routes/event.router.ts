import * as controller from '@/controllers/event.controller';
import type { FastifyPluginCallback } from 'fastify';

import { clientHook } from '@/hooks/client.hook';
import { isBotHook } from '@/hooks/is-bot.hook';

const eventRouter: FastifyPluginCallback = (fastify, opts, done) => {
  fastify.addHook('preHandler', clientHook);
  fastify.addHook('preHandler', isBotHook);

  fastify.route({
    method: 'POST',
    url: '/',
    handler: controller.postEvent,
  });
  done();
};

export default eventRouter;
