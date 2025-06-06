import * as controller from '@/controllers/misc.controller';
import type { FastifyPluginCallback } from 'fastify';

const miscRouter: FastifyPluginCallback = async (fastify) => {
  fastify.route({
    method: 'POST',
    url: '/ping',
    handler: controller.ping,
  });

  fastify.route({
    method: 'GET',
    url: '/stats',
    handler: controller.stats,
  });

  fastify.route({
    method: 'GET',
    url: '/favicon',
    handler: controller.getFavicon,
  });

  fastify.route({
    method: 'GET',
    url: '/favicon/clear',
    handler: controller.clearFavicons,
  });

  fastify.route({
    method: 'GET',
    url: '/geo',
    handler: controller.getGeo,
  });
};

export default miscRouter;
