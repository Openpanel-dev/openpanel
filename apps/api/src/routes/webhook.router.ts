import * as controller from '@/controllers/webhook.controller';
import type { FastifyPluginCallback } from 'fastify';

const webhookRouter: FastifyPluginCallback = (fastify, opts, done) => {
  fastify.route({
    method: 'GET',
    url: '/slack',
    handler: controller.slackWebhook,
  });
  done();
};

export default webhookRouter;
