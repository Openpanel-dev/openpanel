import { isBot } from '@/bots';
import * as controller from '@/controllers/profile.controller';
import { SdkAuthError, validateSdkRequest } from '@/utils/auth';
import { logger } from '@/utils/logger';
import type { FastifyPluginCallback } from 'fastify';

const eventRouter: FastifyPluginCallback = (fastify, opts, done) => {
  fastify.addHook('preHandler', async (req, reply) => {
    try {
      const client = await validateSdkRequest(req.headers).catch((error) => {
        if (error instanceof SdkAuthError) {
          return reply.status(401).send(error.message);
        }
        logger.error(error, 'Failed to validate sdk request');
        return reply.status(401).send('Unknown validation error');
      });

      if (!client?.projectId) {
        return reply.status(401).send('No project found for this client');
      }
      req.projectId = client.projectId;
      req.client = client;

      const bot = req.headers['user-agent']
        ? isBot(req.headers['user-agent'])
        : null;

      if (bot) {
        return reply.status(202).send('OK');
      }
    } catch (e) {
      logger.error(e, 'Failed to create bot event');
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
