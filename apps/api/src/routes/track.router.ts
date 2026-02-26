import { fetchDeviceId, handler } from '@/controllers/track.controller';
import type { FastifyPluginCallback } from 'fastify';

import { clientHook } from '@/hooks/client.hook';
import { duplicateHook } from '@/hooks/duplicate.hook';
import { isBotHook } from '@/hooks/is-bot.hook';

const trackRouter: FastifyPluginCallback = async (fastify) => {
  fastify.addHook('preValidation', duplicateHook);
  fastify.addHook('preHandler', clientHook);
  fastify.addHook('preHandler', isBotHook);

  fastify.route({
    method: 'POST',
    url: '/',
    handler: handler,
  });

  fastify.route({
    method: 'GET',
    url: '/device-id',
    handler: fetchDeviceId,
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            deviceId: { type: 'string' },
            sessionId: { type: 'string' },
            message: { type: 'string', optional: true },
          },
        },
      },
    },
  });
};

export default trackRouter;
