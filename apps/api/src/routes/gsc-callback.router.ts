import { gscGoogleCallback } from '@/controllers/gsc-oauth-callback.controller';
import type { FastifyPluginCallback } from 'fastify';

const router: FastifyPluginCallback = async (fastify) => {
  fastify.route({
    method: 'GET',
    url: '/callback',
    handler: gscGoogleCallback,
  });
};

export default router;
