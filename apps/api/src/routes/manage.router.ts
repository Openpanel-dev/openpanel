import { Prisma, resolveClientProjectId } from '@openpanel/db';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi';
import { z } from 'zod';
import * as controller from '@/controllers/manage.controller';
import { listDashboards, listReports } from '@/controllers/insights.controller';
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

    // Validate :projectId URL param belongs to this client's organization.
    const client = req.client!;
    const params = req.params as { projectId?: string };
    if (params.projectId) {
      try {
        await resolveClientProjectId({
          clientType: 'root',
          clientProjectId: null,
          organizationId: client.organizationId,
          inputProjectId: params.projectId,
        });
      } catch {
        return reply.status(403).send({ error: 'Forbidden', message: 'Project does not belong to your organization' });
      }
    }
  });

  // Projects routes
  fastify.route({
    method: 'GET',
    url: '/projects',
    schema: { tags: ['Manage'], description: 'List all projects for the organization.' },
    handler: controller.listProjects,
  });

  fastify.route({
    method: 'GET',
    url: '/projects/:id',
    schema: { params: idParam, tags: ['Manage'], description: 'Get a single project by ID.' },
    handler: controller.getProject,
  });

  fastify.route({
    method: 'POST',
    url: '/projects',
    schema: { body: zCreateProject, tags: ['Manage'], description: 'Create a new project and its first write client.' },
    handler: controller.createProject,
  });

  fastify.route({
    method: 'PATCH',
    url: '/projects/:id',
    schema: { params: idParam, body: zUpdateProject, tags: ['Manage'], description: 'Update project settings (name, domain, CORS, tracking options).' },
    handler: controller.updateProject,
  });

  fastify.route({
    method: 'DELETE',
    url: '/projects/:id',
    schema: { params: idParam, tags: ['Manage'], description: 'Soft-delete a project (scheduled for removal in 24 hours).' },
    handler: controller.deleteProject,
  });

  // Clients routes
  fastify.route({
    method: 'GET',
    url: '/clients',
    schema: { tags: ['Manage'], description: 'List all API clients for the organization, optionally filtered by project.' },
    handler: controller.listClients,
  });

  fastify.route({
    method: 'GET',
    url: '/clients/:id',
    schema: { params: idParam, tags: ['Manage'], description: 'Get a single API client by ID.' },
    handler: controller.getClient,
  });

  fastify.route({
    method: 'POST',
    url: '/clients',
    schema: { body: zCreateClient, tags: ['Manage'], description: 'Create a new API client (read, write, or root type) and return its generated secret.' },
    handler: controller.createClient,
  });

  fastify.route({
    method: 'PATCH',
    url: '/clients/:id',
    schema: { params: idParam, body: zUpdateClient, tags: ['Manage'], description: 'Update an API client name.' },
    handler: controller.updateClient,
  });

  fastify.route({
    method: 'DELETE',
    url: '/clients/:id',
    schema: { params: idParam, tags: ['Manage'], description: 'Delete an API client.' },
    handler: controller.deleteClient,
  });

  // References routes
  fastify.route({
    method: 'GET',
    url: '/references',
    schema: { tags: ['Manage'], description: 'List annotation references for a project.' },
    handler: controller.listReferences,
  });

  fastify.route({
    method: 'GET',
    url: '/references/:id',
    schema: { params: idParam, tags: ['Manage'], description: 'Get a single annotation reference by ID.' },
    handler: controller.getReference,
  });

  fastify.route({
    method: 'POST',
    url: '/references',
    schema: { body: zCreateReference, tags: ['Manage'] },
    handler: controller.createReference,
  });

  fastify.route({
    method: 'PATCH',
    url: '/references/:id',
    schema: { params: idParam, body: zUpdateReference, tags: ['Manage'] },
    handler: controller.updateReference,
  });

  fastify.route({
    method: 'DELETE',
    url: '/references/:id',
    schema: { params: idParam, tags: ['Manage'] },
    handler: controller.deleteReference,
  });

  // Dashboards & reports
  fastify.route({
    method: 'GET',
    url: '/projects/:projectId/dashboards',
    schema: {
      params: z.object({ projectId: z.string() }),
      tags: ['Manage'],
      description: 'List all dashboards for a project.',
    },
    handler: listDashboards,
  });

  fastify.route({
    method: 'GET',
    url: '/projects/:projectId/dashboards/:dashboardId/reports',
    schema: {
      params: z.object({ projectId: z.string(), dashboardId: z.string() }),
      tags: ['Manage'],
      description: 'List all reports in a dashboard.',
    },
    handler: listReports,
  });
};

export default manageRouter;
