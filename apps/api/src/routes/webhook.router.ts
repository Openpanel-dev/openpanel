import * as controller from '@/controllers/webhook.controller';
import type { FastifyPluginCallback } from 'fastify';

const webhookRouter: FastifyPluginCallback = (fastify, opts, done) => {
  fastify.route({
    method: 'POST',
    url: '/clerk',
    handler: controller.clerkWebhook,
  });
  done();
};

export default webhookRouter;
