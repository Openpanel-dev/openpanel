import * as controller from '@/controllers/agent.controller';
import { agentAuthHook } from '@/hooks/agent-auth.hook';
import type { FastifyPluginCallback } from 'fastify';

const agentRouter: FastifyPluginCallback = async (fastify) => {
  fastify.addHook('onRequest', agentAuthHook);

  fastify.route({
    method: 'GET',
    url: '/users/:fbUid/sessions',
    handler: controller.listUserSessions,
  });
};

export default agentRouter;
