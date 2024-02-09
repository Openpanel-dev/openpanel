import * as controller from '@/controllers/live.controller';
import type { FastifyPluginCallback } from 'fastify';

const liveRouter: FastifyPluginCallback = (fastify, opts, done) => {
  fastify.route({
    method: 'GET',
    url: '/events/test',
    handler: controller.test,
  });

  fastify.route({
    method: 'GET',
    url: '/events/:projectId',
    handler: controller.events,
  });
  done();
};

export default liveRouter;
