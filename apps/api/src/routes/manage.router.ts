import * as controller from '@/controllers/manage.controller';
import { validateManageRequest } from '@/utils/auth';
import { activateRateLimiter } from '@/utils/rate-limiter';
import { Prisma } from '@openpanel/db';
import type { FastifyPluginCallback, FastifyRequest } from 'fastify';

const manageRouter: FastifyPluginCallback = async (fastify) => {
  await activateRateLimiter({
    fastify,
    max: 20,
    timeWindow: '10 seconds',
  });

  fastify.addHook('preHandler', async (req: FastifyRequest, reply) => {
    try {
      const client = await validateManageRequest(req.headers);
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

  // Projects routes
  fastify.route({
    method: 'GET',
    url: '/projects',
    handler: controller.listProjects,
  });

  fastify.route({
    method: 'GET',
    url: '/projects/:id',
    handler: controller.getProject,
  });

  fastify.route({
    method: 'POST',
    url: '/projects',
    handler: controller.createProject,
  });

  fastify.route({
    method: 'PATCH',
    url: '/projects/:id',
    handler: controller.updateProject,
  });

  fastify.route({
    method: 'DELETE',
    url: '/projects/:id',
    handler: controller.deleteProject,
  });

  // Clients routes
  fastify.route({
    method: 'GET',
    url: '/clients',
    handler: controller.listClients,
  });

  fastify.route({
    method: 'GET',
    url: '/clients/:id',
    handler: controller.getClient,
  });

  fastify.route({
    method: 'POST',
    url: '/clients',
    handler: controller.createClient,
  });

  fastify.route({
    method: 'PATCH',
    url: '/clients/:id',
    handler: controller.updateClient,
  });

  fastify.route({
    method: 'DELETE',
    url: '/clients/:id',
    handler: controller.deleteClient,
  });

  // References routes
  fastify.route({
    method: 'GET',
    url: '/references',
    handler: controller.listReferences,
  });

  fastify.route({
    method: 'GET',
    url: '/references/:id',
    handler: controller.getReference,
  });

  fastify.route({
    method: 'POST',
    url: '/references',
    handler: controller.createReference,
  });

  fastify.route({
    method: 'PATCH',
    url: '/references/:id',
    handler: controller.updateReference,
  });

  fastify.route({
    method: 'DELETE',
    url: '/references/:id',
    handler: controller.deleteReference,
  });
};

export default manageRouter;
