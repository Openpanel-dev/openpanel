// `protectedProcedure` runs `enforceUserIsAuthed` + `enforceAccess` BEFORE the
// input parser. The explicit checks in the handlers below stay: `enforceAccess`
// only sees a TOP-LEVEL `projectId` / `organizationId`, so anything resolved
// from another id needs its own.
//
// `ctx.services.client` carries this module's factory.
//
// The permission ladder itself is bound once, in auth.service.ts; every
// procedure here reaches it through `ctx.services.auth`.

import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../../rpc/base';
import { TRPCForbiddenError } from '../../rpc/errors';
import { CLIENT_TYPES } from './client.service';

export const clientRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      // No access check beyond authentication: this reads any project's
      // clients by projectId alone.
      return ctx.services.client.getClientsByProjectId(input.projectId);
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string(), name: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.userId;
      const access = await ctx.services.auth.getClientAccess({
        userId,
        clientId: input.id,
      });
      if (!access) {
        throw new TRPCForbiddenError('You do not have access to this client');
      }

      const client = await ctx.services.client.getClientById(input.id);
      if (!client) {
        throw new TRPCForbiddenError('Client not found');
      }

      return ctx.services.client.updateClientForOrganization(
        input.id,
        client.organizationId,
        { name: input.name }
      );
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        projectId: z.string(),
        organizationId: z.string(),
        type: z.enum(CLIENT_TYPES).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.userId;
      // Minting an ingestion credential - a `root` one at the caller's
      // choosing - is admin-tier, not something any org member should be
      // able to do.
      await ctx.services.auth.requireOrganizationAdmin({
        userId,
        organizationId: input.organizationId,
        message: 'Only organization admins can create API clients',
      });

      const created = await ctx.services.client.createClientForOrganization(
        input.organizationId,
        {
          name: input.name,
          projectId: input.projectId,
          type: input.type,
        }
      );

      if (!created) {
        throw new TRPCForbiddenError(
          'Project not found or does not belong to your organization'
        );
      }

      return { ...created.client, secret: created.secret };
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.userId;
      const client = await ctx.services.client.getClientById(input.id);

      if (!client?.organizationId) {
        throw new TRPCForbiddenError('You do not have access to this client');
      }

      // Revoking a credential breaks ingestion for whoever is using it.
      await ctx.services.auth.requireOrganizationAdmin({
        userId,
        organizationId: client.organizationId,
        message: 'Only organization admins can delete API clients',
      });

      await ctx.services.client.deleteClientForOrganization(
        input.id,
        client.organizationId
      );
      return true;
    }),
});
