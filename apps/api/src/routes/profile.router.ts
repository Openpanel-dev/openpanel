import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi';
import * as controller from '@/controllers/profile.controller';
import { clientHook } from '@/hooks/client.hook';
import { isBotHook } from '@/hooks/is-bot.hook';

const profileRouter: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.addHook('preHandler', clientHook);
  fastify.addHook('preHandler', isBotHook);

  fastify.route({
    method: 'POST',
    url: '/',
    schema: {
      tags: ['Profile'],
      description: 'Identify or update a user profile.',
    },
    handler: controller.updateProfile,
  });

  fastify.route({
    method: 'POST',
    url: '/increment',
    schema: {
      tags: ['Profile'],
      description: 'Increment a numeric property on a user profile.',
    },
    handler: controller.incrementProfileProperty,
  });

  fastify.route({
    method: 'POST',
    url: '/decrement',
    schema: {
      tags: ['Profile'],
      description: 'Decrement a numeric property on a user profile.',
    },
    handler: controller.decrementProfileProperty,
  });
};

export default profileRouter;
