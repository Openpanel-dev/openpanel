import * as controller from '@/controllers/export.controller';
import { validateExportRequest } from '@/utils/auth';
import { activateRateLimiter } from '@/utils/rate-limiter';
import { Prisma } from '@openpanel/db';
import type { FastifyPluginCallback, FastifyRequest } from 'fastify';

const exportRouter: FastifyPluginCallback = async (fastify) => {
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

  fastify.route({
    method: 'GET',
    url: '/events',
    handler: controller.events,
  });

  fastify.route({
    method: 'GET',
    url: '/charts',
    handler: controller.charts,
  });
};

export default exportRouter;
