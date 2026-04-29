import {
  createPersonalAccessToken,
  deletePersonalAccessToken,
  listPersonalAccessTokens,
} from '@openpanel/db';
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi';
import { z } from 'zod';

const patRouter: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.addHook('preHandler', async (req, reply) => {
    if (!req.session.userId) {
      return reply
        .status(401)
        .send({ error: 'Unauthorized', message: 'Authentication required' });
    }
  });

  fastify.route({
    method: 'GET',
    url: '/',
    schema: {
      tags: ['PAT'],
      description: 'List personal access tokens for the authenticated user.',
      querystring: z.object({ organizationId: z.string() }),
    },
    handler: async (req, reply) => {
      const { organizationId } = req.query as { organizationId: string };
      const tokens = await listPersonalAccessTokens({
        userId: req.session.userId!,
        organizationId,
      });
      return reply.send(tokens);
    },
  });

  fastify.route({
    method: 'POST',
    url: '/',
    schema: {
      tags: ['PAT'],
      description: 'Create a personal access token. The raw token is returned only once.',
      body: z.object({
        name: z.string().min(1).max(100),
        organizationId: z.string(),
        expiresAt: z.coerce.date().optional(),
      }),
    },
    handler: async (req, reply) => {
      const { name, organizationId, expiresAt } = req.body as {
        name: string;
        organizationId: string;
        expiresAt?: Date;
      };
      const token = await createPersonalAccessToken({
        name,
        userId: req.session.userId!,
        organizationId,
        expiresAt,
      });
      return reply.status(201).send(token);
    },
  });

  fastify.route({
    method: 'DELETE',
    url: '/:id',
    schema: {
      tags: ['PAT'],
      description: 'Revoke a personal access token.',
      params: z.object({ id: z.string() }),
    },
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      await deletePersonalAccessToken({ id, userId: req.session.userId! });
      return reply.status(204).send();
    },
  });
};

export default patRouter;
