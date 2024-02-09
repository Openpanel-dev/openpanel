import * as controller from '@/controllers/event.controller';
import { validateSdkRequest } from '@/utils/auth';
import type { FastifyPluginCallback } from 'fastify';

const eventRouter: FastifyPluginCallback = (fastify, opts, done) => {
  fastify.addHook('preHandler', (req, reply, done) => {
    validateSdkRequest(req.headers)
      .then((projectId) => {
        req.projectId = projectId;
        done();
      })
      .catch((e) => {
        console.log(e);

        reply.status(401).send();
      });
  });

  fastify.route({
    method: 'POST',
    url: '/',
    handler: controller.postEvent,
  });
  fastify.route({
    method: 'GET',
    url: '/',
    handler: controller.postEvent,
  });
  done();
};

export default eventRouter;
