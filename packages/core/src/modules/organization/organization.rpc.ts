// Ported from packages/trpc/src/routers/organization.ts (M6-001).
//
// V1's `protectedProcedure` — the logger/session-scope/rate-limit middleware
// stack — lands in core with auth (rpc/base.ts: "those need the resolved
// Session shape and the access rules, so they land with auth (P6)"). Until
// then this router does its own minimal "is anyone logged in" check inline,
// exactly like V1's `enforceUserIsAuthed`. V1 keeps serving the live route
// through packages/trpc's own `protectedProcedure` (full stack included) and
// delegates its handler bodies to `ctx.services.organization` (DELEGATE
// PATTERN), so nothing here is a live regression.
//
// The organization-admin ladder itself IS shared: `./src/access.ts` binds
// core's shared/access.ts ladder to @openpanel/db's real lookups, the same
// way packages/trpc/src/access.ts does for V1.
//
// `getInvite` drops V1's rate limiting (packages/trpc's `rateLimitMiddleware`
// lands with auth, same as `protectedProcedure` above) — V1 keeps enforcing
// it on the live route through its own copy of this router.

import {
  zEditOrganization,
  zInviteUser,
  zUpdateMemberAccess,
} from '@openpanel/validation';
import { z } from 'zod';
import { createTRPCRouter, procedure } from '../../rpc/base';
import {
  TRPCAccessError,
  TRPCBadRequestError,
  TRPCForbiddenError,
} from '../../rpc/errors';

function loadAccessChecks() {
  return import('./src/access');
}

function requireLogin(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCAccessError('Not authenticated');
  }
  return userId;
}

async function requireOrgAdmin(userId: string, organizationId: string) {
  const { requireOrganizationAdmin } = await loadAccessChecks();
  await requireOrganizationAdmin({ userId, organizationId });
}

export const organizationRouter = createTRPCRouter({
  get: procedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input, ctx }) => {
      requireLogin(ctx.session.userId);
      return ctx.services.organization.get(input.organizationId);
    }),

  list: procedure.query(async ({ ctx }) => {
    const userId = requireLogin(ctx.session.userId);
    return ctx.services.organization.list(userId);
  }),

  // Membership-exempt on purpose: any logged-in user may ask whether they have
  // access to a given org. Returns null when they're not a member (instead of
  // throwing), which the org-layout guard uses to render a not-found page.
  myAccess: procedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      const { getOrganizationAccess } = await loadAccessChecks();
      const access = await getOrganizationAccess({
        userId,
        organizationId: input.organizationId,
      });
      if (!access) {
        return null;
      }
      return { role: access.role };
    }),

  update: procedure
    .input(zEditOrganization)
    .mutation(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await requireOrgAdmin(userId, input.id);
      return ctx.services.organization.update(input);
    }),

  delete: procedure
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await requireOrgAdmin(userId, input.organizationId);
      await ctx.services.organization.scheduleDeletion(input.organizationId);
      return true;
    }),

  cancelDeletion: procedure
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await requireOrgAdmin(userId, input.organizationId);
      await ctx.services.organization.cancelDeletion(input.organizationId);
      return true;
    }),

  inviteUser: procedure.input(zInviteUser).mutation(async ({ input, ctx }) => {
    const userId = requireLogin(ctx.session.userId);
    await requireOrgAdmin(userId, input.organizationId);
    return ctx.services.organization.inviteUser({
      organizationId: input.organizationId,
      email: input.email,
      role: input.role,
      access: input.access,
      invitedById: userId,
    });
  }),

  revokeInvite: procedure
    .input(z.object({ inviteId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      const invite = await ctx.services.organization.getInviteOrThrow(
        input.inviteId
      );
      await requireOrgAdmin(userId, invite.organizationId);
      return ctx.services.organization.revokeInvite(input.inviteId);
    }),

  removeMember: procedure
    .input(
      z.object({
        organizationId: z.string(),
        userId: z.string(),
        id: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const requestedByUserId = requireLogin(ctx.session.userId);
      await requireOrgAdmin(requestedByUserId, input.organizationId);
      await ctx.services.organization.removeMember({
        organizationId: input.organizationId,
        memberId: input.id,
        targetUserId: input.userId,
        requestedByUserId,
      });
    }),

  updateMemberAccess: procedure
    .input(zUpdateMemberAccess)
    .mutation(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      if (input.userId === userId) {
        throw new TRPCForbiddenError('You cannot update your own access');
      }
      await requireOrgAdmin(userId, input.organizationId);
      return ctx.services.organization.updateMemberAccess({
        organizationId: input.organizationId,
        targetUserId: input.userId,
        access: input.access,
      });
    }),

  members: procedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await requireOrgAdmin(userId, input.organizationId);
      return ctx.services.organization.members(input.organizationId);
    }),

  invitations: procedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await requireOrgAdmin(userId, input.organizationId);
      return ctx.services.organization.invitations(input.organizationId);
    }),

  getInvite: procedure
    .input(z.object({ inviteId: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      if (!input.inviteId) {
        throw new TRPCBadRequestError('Invite ID is required');
      }
      return ctx.services.organization.getInvite(input.inviteId);
    }),
});
