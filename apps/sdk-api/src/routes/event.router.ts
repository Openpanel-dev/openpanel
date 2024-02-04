import * as controller from '@/controllers/event.controller';
import type { FastifyPluginCallback } from 'fastify';

const eventRouter: FastifyPluginCallback = (fastify, opts, done) => {
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
