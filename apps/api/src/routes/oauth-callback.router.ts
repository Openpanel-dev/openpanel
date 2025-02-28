import * as controller from '@/controllers/oauth-callback.controller';
import type { FastifyPluginCallback } from 'fastify';

const router: FastifyPluginCallback = async (fastify) => {
  fastify.route({
    method: 'GET',
    url: '/github/callback',
    handler: controller.githubCallback,
  });
  fastify.route({
    method: 'GET',
    url: '/google/callback',
    handler: controller.googleCallback,
  });
};

export default router;
