import {
  TRACK_BATCH_MAX_EVENTS,
  zTrackBatchBody,
  zTrackHandlerPayload,
} from '@openpanel/validation';
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi';
import { z } from 'zod';
import {
  batchHandler,
  fetchDeviceId,
  handler,
} from '@/controllers/track.controller';
import { clientHook } from '@/hooks/client.hook';
import { duplicateHook } from '@/hooks/duplicate.hook';
import { isBotHook } from '@/hooks/is-bot.hook';

// Per-route body limit for /track/batch. Each event is small (a few KB at
// most after Zod constraints), 1000 events × ~5 KB ≈ 5 MB headroom.
const TRACK_BATCH_BODY_LIMIT_BYTES = 5 * 1024 * 1024;

const trackRouter: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.addHook('preHandler', clientHook);
  fastify.addHook('preHandler', isBotHook);

  await fastify.route({
    method: 'POST',
    url: '/',
    // The 100 ms body-hash dedup only runs on the single-event endpoint —
    // applying it batch-wide would drop a whole 1000-event retry on hash
    // collision, which is the opposite of what we want.
    preValidation: duplicateHook,
    schema: {
      body: zTrackHandlerPayload.and(
        z.object({
          clientId: z.string().optional(),
          clientSecret: z.string().optional(),
        }),
      ),
      tags: ['Track'],
      description:
        'Ingest a tracking event (track, identify, group, increment, decrement, replay).',
      response: {
        200: z.object({
          deviceId: z.string(),
          sessionId: z.string(),
        }),
      },
    },
    handler,
  });

  await fastify.route({
    method: 'POST',
    url: '/batch',
    bodyLimit: TRACK_BATCH_BODY_LIMIT_BYTES,
    schema: {
      body: zTrackBatchBody,
      tags: ['Track'],
      description: `Bulk-ingest up to ${TRACK_BATCH_MAX_EVENTS} tracking events in a single request. Each event is dispatched through the same pipeline as POST /track. Per-event validation failures are returned in the rejected[] array — the whole batch does not fail on a single bad row.`,
      response: {
        202: z.object({
          accepted: z.number().int().min(0),
          rejected: z.array(
            z.object({
              index: z.number().int().min(0),
              reason: z.enum(['validation', 'internal']),
              error: z.string(),
            }),
          ),
        }),
      },
    },
    handler: batchHandler,
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
