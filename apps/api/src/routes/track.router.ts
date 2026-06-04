import {
  TRACK_BATCH_MAX_EVENTS,
  zTrackBatchHandlerPayload,
  zTrackHandlerPayload,
} from '@openpanel/validation';
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi';
import { z } from 'zod';
import { fetchDeviceId, handler } from '@/controllers/track.controller';
import { clientHook } from '@/hooks/client.hook';
import { duplicateHook } from '@/hooks/duplicate.hook';
import { isBotHook } from '@/hooks/is-bot.hook';

// Body limit for POST /track: 10 MB uncompressed, sized for batch requests
// ("up to 2000 events and 10 MB per request"). Single events are unaffected
// in practice — they stay far below the previous default limit.
const TRACK_BODY_LIMIT_BYTES = 10 * 1024 * 1024;

const trackRouter: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.addHook('preValidation', duplicateHook);
  fastify.addHook('preHandler', clientHook);
  fastify.addHook('preHandler', isBotHook);

  await fastify.route({
    method: 'POST',
    url: '/',
    bodyLimit: TRACK_BODY_LIMIT_BYTES,
    schema: {
      body: z
        .union([zTrackHandlerPayload, zTrackBatchHandlerPayload])
        .and(
          z.object({
            clientId: z.string().optional(),
            clientSecret: z.string().optional(),
          })
        ),
      tags: ['Track'],
      description: `Ingest a tracking event (track, identify, group, increment, decrement, replay) or a batch of events ({ "type": "batch", "payload": [event, ...] }). Batch requests accept up to ${TRACK_BATCH_MAX_EVENTS} events and 10MB uncompressed per request; each event is dispatched through the same pipeline as a single-event request. Per-event validation failures are returned in the rejected[] array — the whole batch does not fail on a single bad row.`,
      response: {
        200: z.object({
          deviceId: z.string(),
          sessionId: z.string(),
        }),
        202: z.object({
          accepted: z.number().int().min(0),
          rejected: z.array(
            z.object({
              index: z.number().int().min(0),
              reason: z.enum(['validation', 'internal']),
              error: z.string(),
            })
          ),
        }),
      },
    },
    handler,
  });

  await fastify.route({
    method: 'GET',
    url: '/device-id',
    schema: {
      tags: ['Track'],
      description:
        'Get or generate a stable device ID and session ID for the current visitor.',
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
