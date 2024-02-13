import { isBot as isGetBot } from '@/bots';
import * as controller from '@/controllers/event.controller';
import { validateSdkRequest } from '@/utils/auth';
import type { FastifyPluginCallback } from 'fastify';

const eventRouter: FastifyPluginCallback = (fastify, opts, done) => {
  fastify.addHook('preHandler', (req, reply, done) => {
    const isBot = req.headers['user-agent']
      ? isGetBot(req.headers['user-agent'])
      : false;
    if (isBot) {
      reply.log.warn({ ...req.headers, bot: isBot }, 'Bot detected');
      reply.status(202).send('OK');
    }

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
