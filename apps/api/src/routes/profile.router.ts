import { isBot } from '@/bots';
import * as controller from '@/controllers/profile.controller';
import { validateSdkRequest } from '@/utils/auth';
import type { FastifyPluginCallback } from 'fastify';

const eventRouter: FastifyPluginCallback = (fastify, opts, done) => {
  fastify.addHook('preHandler', async (req, reply) => {
    try {
      const projectId = await validateSdkRequest(req.headers).catch(() => null);
      if (!projectId) {
        return reply.status(401).send();
      }
      req.projectId = projectId;

      const bot = req.headers['user-agent']
        ? isBot(req.headers['user-agent'])
        : null;

      if (bot) {
        reply.log.warn({ ...req.headers, bot }, 'Bot detected (profile)');
        reply.status(202).send('OK');
      }
    } catch (e) {
      reply.status(401).send();
      return;
    }
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
