// The /manage/clients REST surface, delegating its CRUD bodies to
// client.service.ts's createClientForOrganization/updateClientForOrganization/
// etc — the same functions the tRPC router (client.rpc.ts) calls. Response
// envelopes (`{ data }` / `{ success }`) match V1's `reply.send(...)` shape
// (byte-unchanged URL surface).
//
// Body schemas are local, not a client.constants.ts file: the module map gives
// client "R,H,S" only, no "C" (unlike project, whose zCreateProject /
// zUpdateProject moved with ProjectTypeNames).
//
// `authenticateAllowedClient` (http/client-auth.ts) is filled in and
// `publicApiRoutes` is mounted in main.ts, so this route is live. `allow:
// ['root']` mirrors V1's rule: only root clients may manage resources. (A
// client minted through client.service.ts cannot currently authenticate at all
// — see that file's FIXME on `createClientForOrganization`.)

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
