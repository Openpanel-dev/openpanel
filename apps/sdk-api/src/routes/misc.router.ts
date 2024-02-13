import * as controller from '@/controllers/misc.controller';
import type { FastifyPluginCallback } from 'fastify';

const miscRouter: FastifyPluginCallback = (fastify, opts, done) => {
  fastify.route({
    method: 'GET',
    url: '/favicon',
    handler: controller.getFavicon,
  });

  done();
};

export default miscRouter;
