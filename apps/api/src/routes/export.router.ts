import { Prisma } from '@openpanel/db';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi';
import {
  chartSchemeFull,
  eventsScheme,
} from '@/controllers/export.controller';
import * as controller from '@/controllers/export.controller';
import { validateExportRequest } from '@/utils/auth';
import { parseQueryString } from '@/utils/parse-zod-query-string';
import { activateRateLimiter } from '@/utils/rate-limiter';

const TAGS = ['Export'] as const;

const exportRouter: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  await activateRateLimiter({ fastify, max: 100, timeWindow: '10 seconds' });

  fastify.addHook('preHandler', async (req: FastifyRequest, reply) => {
    try {
      const client = await validateExportRequest(req.headers);
      req.client = client;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        return reply.status(401).send({ error: 'Unauthorized', message: 'Client ID seems to be malformed' });
      }
      if (e instanceof Error) {
        return reply.status(401).send({ error: 'Unauthorized', message: e.message });
      }
      return reply.status(401).send({ error: 'Unauthorized', message: 'Unexpected error' });
    }
  });

  fastify.addHook('preValidation', async (req) => {
    req.query = parseQueryString(req.query as Record<string, unknown>) as typeof req.query;
  });

  fastify.route({
    method: 'GET',
    url: '/events',
    schema: {
      tags: TAGS,
      description: 'Export a paginated list of raw events with optional filtering by date, profile, and event type.',
      querystring: eventsScheme,
    },
    handler: controller.events,
  });

  fastify.route({
    method: 'GET',
    url: '/charts',
    schema: {
      tags: TAGS,
      description: 'Export aggregated chart/analytics data for a series of events over a time range.',
      querystring: chartSchemeFull,
    },
    handler: controller.charts,
  });
};

export default exportRouter;
