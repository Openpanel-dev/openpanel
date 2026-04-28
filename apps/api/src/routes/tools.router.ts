import * as controller from '@/controllers/tools.controller';
import type { FastifyPluginCallback } from 'fastify';

const toolsRouter: FastifyPluginCallback = async (fastify) => {
  fastify.route({
    method: 'GET',
    url: '/site-checker',
    schema: { hide: true },
    handler: controller.siteChecker,
  });

  fastify.route({
    method: 'GET',
    url: '/ip-lookup',
    schema: { hide: true },
    handler: controller.ipLookup,
  });
};

export default toolsRouter;
