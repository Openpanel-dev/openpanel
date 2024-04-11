import * as controller from '@/controllers/export.controller';
import { validateExportRequest } from '@/utils/auth';
import type { FastifyPluginCallback, FastifyRequest } from 'fastify';

import { Prisma } from '@openpanel/db';

const eventRouter: FastifyPluginCallback = (fastify, opts, done) => {
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
      } else if (e instanceof Error) {
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
  done();
};

export default eventRouter;
