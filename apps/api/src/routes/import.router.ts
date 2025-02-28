import * as controller from '@/controllers/import.controller';
import { validateImportRequest } from '@/utils/auth';
import type { FastifyPluginCallback, FastifyRequest } from 'fastify';

import { Prisma } from '@openpanel/db';

const importRouter: FastifyPluginCallback = async (fastify) => {
  fastify.addHook('preHandler', async (req: FastifyRequest, reply) => {
    try {
      const client = await validateImportRequest(req.headers);
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
    method: 'POST',
    url: '/events',
    handler: controller.importEvents,
  });
};

export default importRouter;
