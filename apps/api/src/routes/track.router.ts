import { zTrackHandlerPayload } from '@openpanel/validation';
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi';
import { z } from 'zod';
import { fetchDeviceId, handler } from '@/controllers/track.controller';
import { clientHook } from '@/hooks/client.hook';
import { duplicateHook } from '@/hooks/duplicate.hook';
import { isBotHook } from '@/hooks/is-bot.hook';

const trackRouter: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.addHook('preValidation', duplicateHook);
  fastify.addHook('preHandler', clientHook);
  fastify.addHook('preHandler', isBotHook);

  fastify.route({
    method: 'POST',
    url: '/',
    schema: {
      body: zTrackHandlerPayload,
      tags: ['ingestion'],
      description: 'Ingest a tracking event (track, identify, group, increment, decrement, replay).',
    },
    handler,
  });

  fastify.route({
    method: 'GET',
    url: '/device-id',
    schema: {
      tags: ['ingestion'],
      description: 'Get or generate a stable device ID and session ID for the current visitor.',
      response: {
        200: z.object({
          deviceId: z.string(),
          sessionId: z.string(),
          message: z.string().optional(),
        }),
      },
    },
    handler: fetchDeviceId,
  });
};

export default trackRouter;
