import * as controller from '@/controllers/live.controller';
import fastifyWS from '@fastify/websocket';
import type { FastifyPluginCallback } from 'fastify';

const liveRouter: FastifyPluginCallback = async (fastify) => {
  fastify.register(fastifyWS);

  fastify.register(async (fastify) => {
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
  });
};

export default liveRouter;
