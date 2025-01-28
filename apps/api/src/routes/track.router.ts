import { handler } from '@/controllers/track.controller';
import type { FastifyPluginCallback } from 'fastify';

import { clientHook } from '@/hooks/client.hook';
import { isBotHook } from '@/hooks/is-bot.hook';

const trackRouter: FastifyPluginCallback = (fastify, opts, done) => {
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

  done();
};

export default trackRouter;
