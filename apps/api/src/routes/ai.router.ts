import * as controller from '@/controllers/ai.controller';
import { activateRateLimiter } from '@/utils/rate-limiter';
import type { FastifyPluginCallback, FastifyRequest } from 'fastify';

const aiRouter: FastifyPluginCallback = async (fastify) => {
  await activateRateLimiter<
    FastifyRequest<{
      Querystring: {
        projectId: string;
      };
    }>
  >({
    fastify,
    max: process.env.NODE_ENV === 'production' ? 20 : 100,
    timeWindow: '300 seconds',
    keyGenerator: (req) => {
      return req.query.projectId;
    },
  });

  fastify.route({
    method: 'POST',
    url: '/chat',
    handler: controller.chat,
  });
};

export default aiRouter;
