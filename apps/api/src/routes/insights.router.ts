import * as controller from '@/controllers/insights.controller';
import { validateExportRequest } from '@/utils/auth';
import { activateRateLimiter } from '@/utils/rate-limiter';
import { Prisma } from '@openpanel/db';
import type { FastifyPluginCallback, FastifyRequest } from 'fastify';

const insightsRouter: FastifyPluginCallback = async (fastify) => {
  await activateRateLimiter({
    fastify,
    max: 100,
    timeWindow: '10 seconds',
  });

  fastify.addHook('preHandler', async (req: FastifyRequest, reply) => {
    try {
      const client = await validateExportRequest(req.headers);
      req.client = client;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Client ID seems to be malformed',
        });
      }

      if (e instanceof Error) {
        return reply
          .status(401)
          .send({ error: 'Unauthorized', message: e.message });
      }

      return reply
        .status(401)
        .send({ error: 'Unauthorized', message: 'Unexpected error' });
    }
  });

  // Website stats - main metrics overview
  fastify.route({
    method: 'GET',
    url: '/:projectId/metrics',
    handler: controller.getMetrics,
  });

  // Live visitors (real-time)
  fastify.route({
    method: 'GET',
    url: '/:projectId/live',
    handler: controller.getLiveVisitors,
  });

  // Page views with top pages
  fastify.route({
    method: 'GET',
    url: '/:projectId/pages',
    handler: controller.getPages,
  });

  const overviewMetrics = [
    'referrer_name',
    'referrer',
    'referrer_type',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'device',
    'browser',
    'browser_version',
    'os',
    'os_version',
    'brand',
    'model',
    'country',
    'region',
    'city',
  ] as const;

  overviewMetrics.forEach((key) => {
    fastify.route({
      method: 'GET',
      url: `/:projectId/${key}`,
      handler: controller.getOverviewGeneric(key),
    });
  });
};

export default insightsRouter;
