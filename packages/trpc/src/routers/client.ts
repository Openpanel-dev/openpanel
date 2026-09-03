// Dissolved into @openpanel/core's client module (M6-002): the CRUD and
// mutation bodies moved to
// packages/core/src/modules/client/client.service.ts. This router stays
// (DELEGATE PATTERN) — it keeps V1's protectedProcedure stack (session/
// access/logger/rate-limit middleware) and delegates every handler body to
// core's client functions, same as organization's router does (M6-001).
import {
  createClientForOrganization,
  deleteClientForOrganization,
  getClientById,
  getClientsByProjectId,
  updateClientForOrganization,
} from '@openpanel/core';
import { z } from 'zod';
import { getClientAccess, requireOrganizationAdmin } from '../access';
import { TRPCForbiddenError } from '../errors';
import { createTRPCRouter, protectedProcedure } from '../trpc';

export const clientRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
      })
    )
    .query(async ({ input }) => {
      return getClientsByProjectId(input.projectId);
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const access = await getClientAccess({
        userId: ctx.session.userId,
        clientId: input.id,
      });

      if (!access) {
        throw new TRPCForbiddenError('You do not have access to this client');
      }

      const client = await getClientById(input.id);
      if (!client) {
        throw new TRPCForbiddenError('Client not found');
      }

      return updateClientForOrganization(input.id, client.organizationId, {
        name: input.name,
      });
    }),
  create: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        projectId: z.string(),
        organizationId: z.string(),
        type: z.enum(['read', 'write', 'root']).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Minting an ingestion credential - a `root` one at the caller's choosing
      // - is admin-tier, not something any org member should be able to do.
      await requireOrganizationAdmin({
        userId: ctx.session.userId,
        organizationId: input.organizationId,
        message: 'Only organization admins can create API clients',
      });

      const created = await createClientForOrganization(input.organizationId, {
        name: input.name,
        projectId: input.projectId,
        type: input.type,
      });

      if (!created) {
        throw new TRPCForbiddenError(
          'Project not found or does not belong to your organization'
        );
      }

      return { ...created.client, secret: created.secret };
    }),
  remove: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const client = await getClientById(input.id);

      if (!client?.organizationId) {
        throw new TRPCForbiddenError('You do not have access to this client');
      }

      // Revoking a credential breaks ingestion for whoever is using it.
      await requireOrganizationAdmin({
        userId: ctx.session.userId,
        organizationId: client.organizationId,
        message: 'Only organization admins can delete API clients',
      });

      await deleteClientForOrganization(input.id, client.organizationId);
      return true;
    }),
});
