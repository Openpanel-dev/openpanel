import type { FastifyPluginCallback } from 'fastify';
import * as controller from '@/controllers/misc.controller';

// `/og/clear` and `/favicon/clear` are removed, not ported (M7-008,
// ADR-015 entry #6: RULED + DEAD — `docs/ANSWERS.md` §1.4 confirms nothing
// depends on them).
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
    url: '/og',
    handler: controller.getOgImage,
  });

  fastify.route({
    method: 'GET',
    url: '/geo',
    handler: controller.getGeo,
  });
};

export default miscRouter;
