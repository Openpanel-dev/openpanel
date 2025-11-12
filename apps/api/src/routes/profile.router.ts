import * as controller from '@/controllers/profile.controller';
import { clientHook } from '@/hooks/client.hook';
import { isBotHook } from '@/hooks/is-bot.hook';
import type { FastifyPluginCallback } from 'fastify';

const eventRouter: FastifyPluginCallback = async (fastify) => {
  fastify.addHook('preHandler', clientHook);
  fastify.addHook('preHandler', isBotHook);

  fastify.route({
    method: 'POST',
    url: '/',
    handler: controller.updateProfile,
  });

  fastify.route({
    method: 'POST',
    url: '/increment',
    handler: controller.incrementProfileProperty,
  });

  fastify.route({
    method: 'POST',
    url: '/decrement',
    handler: controller.decrementProfileProperty,
  });
};

export default eventRouter;
