import * as controller from '@/controllers/live.controller';
import fastifyWS from '@fastify/websocket';
import type { FastifyPluginCallback } from 'fastify';

const liveRouter: FastifyPluginCallback = (fastify, opts, done) => {
  fastify.register(fastifyWS);

  fastify.register((fastify, _, done) => {
    fastify.get(
      '/organization/:organizationId',
      { websocket: true },
      controller.wsOrganizationEvents,
    );
    fastify.get(
      '/visitors/:projectId',
      { websocket: true },
      controller.wsVisitors,
    );
    fastify.get(
      '/events/:projectId',
      { websocket: true },
      controller.wsProjectEvents,
    );
    fastify.get(
      '/notifications/:projectId',
      { websocket: true },
      controller.wsProjectNotifications,
    );
    done();
  });

  done();
};

export default liveRouter;
