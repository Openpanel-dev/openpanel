import * as controller from '@/controllers/profile.controller';
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
        reply.status(401).send();
      });
  });

  fastify.route({
    method: 'POST',
    url: '/',
    handler: controller.updateProfile,
  });

  fastify.route({
    method: 'POST',
    url: '/increment',
    handler: controller.incrementProfileProperty,
  });

  fastify.route({
    method: 'POST',
    url: '/decrement',
    handler: controller.decrementProfileProperty,
  });
  done();
};

export default eventRouter;
