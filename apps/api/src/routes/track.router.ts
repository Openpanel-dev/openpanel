import { handler } from '@/controllers/track.controller';
import type { FastifyPluginCallback } from 'fastify';

import { clientHook } from '@/hooks/client.hook';
import { duplicateHook } from '@/hooks/duplicate.hook';
import { isBotHook } from '@/hooks/is-bot.hook';
import { getRedisCache } from '@openpanel/redis';

const trackRouter: FastifyPluginCallback = async (fastify) => {
  fastify.addHook('preValidation', duplicateHook);
  fastify.addHook('preHandler', clientHook);
  fastify.addHook('preHandler', isBotHook);

  fastify.route({
    method: 'GET',
    url: '/metrics',
    handler: async (req, reply) => {
      const [
        trackCounter,
        queueCounter,
        eventBufferCounter,
        eventBufferCsvCounter,
        eventBufferJsonCounter,
      ] = await Promise.all([
        getRedisCache().get('track:counter'),
        getRedisCache().get('queue:counter'),
        getRedisCache().get('event:buffer:counter'),
        getRedisCache().get('event:buffer:csv:counter'),
        getRedisCache().get('event:buffer:json:counter'),
      ]);
      return reply.send({
        track: trackCounter,
        queue: queueCounter,
        eventBuffer: eventBufferCounter,
        eventBufferCsv: eventBufferCsvCounter,
        eventBufferJson: eventBufferJsonCounter,
      });
    },
  });

  fastify.route({
    method: 'GET',
    url: '/metrics/reset',
    handler: async (req, reply) => {
      await Promise.all([
        getRedisCache().del('track:counter'),
        getRedisCache().del('queue:counter'),
        getRedisCache().del('event:buffer:counter'),
        getRedisCache().del('event:buffer:csv:counter'),
        getRedisCache().del('event:buffer:json:counter'),
      ]);
    },
  });

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
