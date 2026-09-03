// Ported from packages/trpc/src/routers/client.ts (M6-002).
//
// V1's `protectedProcedure` — the logger/session-scope/rate-limit middleware
// stack — lands in core with auth (rpc/base.ts: "those need the resolved
// Session shape and the access rules, so they land with auth (P6)"). Until
// then this router does its own minimal "is anyone logged in" check inline,
// exactly like V1's `enforceUserIsAuthed`. V1 keeps serving the live route
// through packages/trpc's own `protectedProcedure` (full stack included) and
// delegates its handler bodies to core's client functions (DELEGATE
// PATTERN) — this module has no queue/cron of its own, so there is no
// `ctx.services.client`, same as `user`/`conversation`.
//
// `./src/access.ts` binds core's shared/access.ts ladder to @openpanel/db's
// real lookups, dynamically imported (`loadAccessChecks`) same as
// organization.rpc.ts, so a static import here does not pull
// @openpanel/db's prisma client into every core test file.

import { z } from 'zod';
import { createTRPCRouter, procedure } from '../../rpc/base';
import { TRPCAccessError, TRPCForbiddenError } from '../../rpc/errors';
import {
  createClientForOrganization,
  deleteClientForOrganization,
  getClientById,
  getClientsByProjectId,
  updateClientForOrganization,
} from './client.service';

function loadAccessChecks() {
  return import('./src/access');
}

function requireLogin(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCAccessError('Not authenticated');
  }
  return userId;
}

export const clientRouter = createTRPCRouter({
  list: procedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      // Ported verbatim: V1's `client.list` reads by projectId with no
      // access check of its own (packages/trpc/src/routers/client.ts).
      return getClientsByProjectId(input.projectId);
    }),

  update: procedure
    .input(z.object({ id: z.string(), name: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      const { getClientAccess } = await loadAccessChecks();
      const access = await getClientAccess({ userId, clientId: input.id });
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

  create: procedure
    .input(
      z.object({
        name: z.string(),
        projectId: z.string(),
        organizationId: z.string(),
        type: z.enum(['read', 'write', 'root']).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      const { requireOrganizationAdmin } = await loadAccessChecks();
      // Minting an ingestion credential - a `root` one at the caller's
      // choosing - is admin-tier, not something any org member should be
      // able to do.
      await requireOrganizationAdmin({
        userId,
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

  remove: procedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      const client = await getClientById(input.id);

      if (!client?.organizationId) {
        throw new TRPCForbiddenError('You do not have access to this client');
      }

      const { requireOrganizationAdmin } = await loadAccessChecks();
      // Revoking a credential breaks ingestion for whoever is using it.
      await requireOrganizationAdmin({
        userId,
        organizationId: client.organizationId,
        message: 'Only organization admins can delete API clients',
      });

      await deleteClientForOrganization(input.id, client.organizationId);
      return true;
    }),
});
