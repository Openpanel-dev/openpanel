// Auth goes through `authenticateAllowedClient` (http/client-auth.ts);
// `allow: ['root']` means only root clients may manage resources.

import { z } from 'zod';
import { defineRoutes } from '../../http/define';
import { CLIENT_TYPES } from './client.service';

const idParams = z.object({ id: z.string() });
const listQuery = z.object({ projectId: z.string().optional() });

const zCreateClient = z.object({
  name: z.string().min(1),
  projectId: z.string().optional(),
  type: z.enum(CLIENT_TYPES).optional().default('write'),
});

const zUpdateClient = z.object({
  name: z.string().min(1).optional(),
});

export const clientRoutes = defineRoutes((app) =>
  app
    .get(
      '/manage/clients',
      async ({ client, ctx, query, status }) => {
        const clients = await ctx.services.client.listClientsForOrganization(
          client.organizationId,
          query.projectId
        );
        if (clients === null) {
          return status(404, {
            error: 'Not Found',
            message: 'Project not found',
          });
        }
        return { data: clients };
      },
      {
        clientAuth: { allow: ['root'], label: 'Manage' },
        query: listQuery,
        detail: { tags: ['Manage'] },
      }
    )
    .get(
      '/manage/clients/:id',
      async ({ client, ctx, params, status }) => {
        const found = await ctx.services.client.getClientForOrganization(
          params.id,
          client.organizationId
        );
        if (!found) {
          return status(404, {
            error: 'Not Found',
            message: 'Client not found',
          });
        }
        return { data: found };
      },
      {
        clientAuth: { allow: ['root'], label: 'Manage' },
        params: idParams,
        detail: { tags: ['Manage'] },
      }
    )
    .post(
      '/manage/clients',
      async ({ body, client, ctx, status }) => {
        const created = await ctx.services.client.createClientForOrganization(
          client.organizationId,
          body
        );
        if (!created) {
          return status(404, {
            error: 'Not Found',
            message: 'Project not found',
          });
        }
        return {
          data: { ...created.client, secret: created.secret },
        };
      },
      {
        clientAuth: { allow: ['root'], label: 'Manage' },
        body: zCreateClient,
        detail: { tags: ['Manage'] },
      }
    )
    .patch(
      '/manage/clients/:id',
      async ({ body, client, ctx, params, status }) => {
        const updated = await ctx.services.client.updateClientForOrganization(
          params.id,
          client.organizationId,
          body
        );
        if (!updated) {
          return status(404, {
            error: 'Not Found',
            message: 'Client not found',
          });
        }
        return { data: updated };
      },
      {
        clientAuth: { allow: ['root'], label: 'Manage' },
        params: idParams,
        body: zUpdateClient,
        detail: { tags: ['Manage'] },
      }
    )
    .delete(
      '/manage/clients/:id',
      async ({ client, ctx, params, status }) => {
        const deleted = await ctx.services.client.deleteClientForOrganization(
          params.id,
          client.organizationId
        );
        if (!deleted) {
          return status(404, {
            error: 'Not Found',
            message: 'Client not found',
          });
        }
        return { success: true };
      },
      {
        clientAuth: { allow: ['root'], label: 'Manage' },
        params: idParams,
        detail: { tags: ['Manage'] },
      }
    )
);
