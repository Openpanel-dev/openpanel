import { handler } from '@/controllers/track.controller';
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
    schema: {
      body: {
        type: 'object',
        required: ['type', 'payload'],
        properties: {
          type: {
            type: 'string',
            enum: ['track', 'increment', 'decrement', 'alias', 'identify'],
          },
          payload: {
            type: 'object',
            additionalProperties: true,
          },
        },
      },
    },
  });
};

export default trackRouter;
