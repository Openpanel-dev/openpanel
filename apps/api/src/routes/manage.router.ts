import { Prisma } from '@openpanel/db';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi';
import { z } from 'zod';
import * as controller from '@/controllers/manage.controller';
import {
  zCreateClient,
  zCreateProject,
  zCreateReference,
  zUpdateClient,
  zUpdateProject,
  zUpdateReference,
} from '@/controllers/manage.controller';
import { validateManageRequest } from '@/utils/auth';
import { activateRateLimiter } from '@/utils/rate-limiter';

const idParam = z.object({ id: z.string() });

const manageRouter: FastifyPluginAsyncZodOpenApi = async (fastify) => {
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
    schema: { tags: ['manage'] },
    handler: controller.listProjects,
  });

  fastify.route({
    method: 'GET',
    url: '/projects/:id',
    schema: { params: idParam, tags: ['manage'] },
    handler: controller.getProject,
  });

  fastify.route({
    method: 'POST',
    url: '/projects',
    schema: { body: zCreateProject, tags: ['manage'] },
    handler: controller.createProject,
  });

  fastify.route({
    method: 'PATCH',
    url: '/projects/:id',
    schema: { params: idParam, body: zUpdateProject, tags: ['manage'] },
    handler: controller.updateProject,
  });

  fastify.route({
    method: 'DELETE',
    url: '/projects/:id',
    schema: { params: idParam, tags: ['manage'] },
    handler: controller.deleteProject,
  });

  // Clients routes
  fastify.route({
    method: 'GET',
    url: '/clients',
    schema: { tags: ['manage'] },
    handler: controller.listClients,
  });

  fastify.route({
    method: 'GET',
    url: '/clients/:id',
    schema: { params: idParam, tags: ['manage'] },
    handler: controller.getClient,
  });

  fastify.route({
    method: 'POST',
    url: '/clients',
    schema: { body: zCreateClient, tags: ['manage'] },
    handler: controller.createClient,
  });

  fastify.route({
    method: 'PATCH',
    url: '/clients/:id',
    schema: { params: idParam, body: zUpdateClient, tags: ['manage'] },
    handler: controller.updateClient,
  });

  fastify.route({
    method: 'DELETE',
    url: '/clients/:id',
    schema: { params: idParam, tags: ['manage'] },
    handler: controller.deleteClient,
  });

  // References routes
  fastify.route({
    method: 'GET',
    url: '/references',
    schema: { tags: ['manage'] },
    handler: controller.listReferences,
  });

  fastify.route({
    method: 'GET',
    url: '/references/:id',
    schema: { params: idParam, tags: ['manage'] },
    handler: controller.getReference,
  });

  fastify.route({
    method: 'POST',
    url: '/references',
    schema: { body: zCreateReference, tags: ['manage'] },
    handler: controller.createReference,
  });

  fastify.route({
    method: 'PATCH',
    url: '/references/:id',
    schema: { params: idParam, body: zUpdateReference, tags: ['manage'] },
    handler: controller.updateReference,
  });

  fastify.route({
    method: 'DELETE',
    url: '/references/:id',
    schema: { params: idParam, tags: ['manage'] },
    handler: controller.deleteReference,
  });
};

export default manageRouter;
