import { gscGoogleCallback, gscInitiate } from '@/controllers/gsc-oauth-callback.controller';
import type { FastifyPluginCallback } from 'fastify';

const router: FastifyPluginCallback = async (fastify) => {
  fastify.route({
    method: 'GET',
    url: '/initiate',
    handler: gscInitiate,
  });
  fastify.route({
    method: 'GET',
    url: '/callback',
    handler: gscGoogleCallback,
  });
};

export default router;
