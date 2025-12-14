import * as controller from '@/controllers/misc.controller';
import { insightsQueue } from '@openpanel/queue';
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
    url: '/og',
    handler: controller.getOgImage,
  });

  fastify.route({
    method: 'GET',
    url: '/og/clear',
    handler: controller.clearOgImages,
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

  fastify.route({
    method: 'GET',
    url: '/insights/test',
    handler: async (req, reply) => {
      const projectId = req.query.projectId as string;
      const job = await insightsQueue.add(
        'insightsProject',
        {
          type: 'insightsProject',
          payload: {
            projectId: projectId,
            date: new Date().toISOString().slice(0, 10),
          },
        },
        { jobId: `manual:${Date.now()}:${projectId}` },
      );

      return { jobId: job.id };
    },
  });
};

export default miscRouter;
