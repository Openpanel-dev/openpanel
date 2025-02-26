import * as controller from '@/controllers/live.controller';
import fastifyWS from '@fastify/websocket';
import type { FastifyPluginCallback } from 'fastify';

// TODO: `as any` is a workaround since it starts to break after changed module resolution to bundler
// which is needed for @polar/sdk (dont have time to resolve this now)
const liveRouter: FastifyPluginCallback = (fastify, opts, done) => {
  fastify.register(fastifyWS);

  fastify.register((fastify, _, done) => {
    fastify.get(
      '/organization/:organizationId',
      { websocket: true },
      controller.wsOrganizationEvents as any,
    );
    fastify.get(
      '/visitors/:projectId',
      { websocket: true },
      controller.wsVisitors as any,
    );
    fastify.get(
      '/events/:projectId',
      { websocket: true },
      controller.wsProjectEvents as any,
    );
    fastify.get(
      '/notifications/:projectId',
      { websocket: true },
      controller.wsProjectNotifications as any,
    );
    done();
  });

  done();
};

export default liveRouter;
