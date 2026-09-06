// Ported from packages/trpc/src/routers/organization.ts (M6-001).
//
// M11-001: every procedure is on its V1 twin's builder.
// `protectedProcedure` runs `enforceUserIsAuthed` + `enforceAccess` BEFORE
// the input parser, exactly as V1 does. The explicit checks in the handlers
// below stay: `enforceAccess` only sees a TOP-LEVEL `projectId` /
// `organizationId`, so anything resolved from another id needs its own
// (ADR-011).
//
// The organization-admin ladder itself is bound once, in auth.service.ts
// (M10-002); every procedure here reaches it through `ctx.services.auth`.
//
// `getInvite` still drops V1's rate limiting: `rateLimitMiddleware` did NOT
// move with M11-001. `createRateLimitMiddleware` in rpc/base.ts is the seam
// that will carry it.

import {
  zEditOrganization,
  zInviteUser,
  zUpdateMemberAccess,
} from '@openpanel/validation';
import { z } from 'zod';
import {
  createTRPCRouter,
  protectedProcedure,
  protectedProcedureWithoutAccess,
  publicProcedure,
  type TrpcContext,
} from '../../rpc/base';
import {
  TRPCAccessError,
  TRPCBadRequestError,
  TRPCForbiddenError,
} from '../../rpc/errors';

function requireLogin(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCAccessError('Not authenticated');
  }
  return userId;
}

async function requireOrgAdmin(ctx: TrpcContext, organizationId: string) {
  await ctx.services.auth.requireOrganizationAdmin({
    userId: requireLogin(ctx.session.userId),
    organizationId,
  });
}

export const organizationRouter = createTRPCRouter({
  get: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input, ctx }) => {
      requireLogin(ctx.session.userId);
      return ctx.services.organization.get(input.organizationId);
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = requireLogin(ctx.session.userId);
    return ctx.services.organization.list(userId);
  }),

  // Membership-exempt on purpose: any logged-in user may ask whether they have
  // access to a given org. Returns null when they're not a member (instead of
  // throwing), which the org-layout guard uses to render a not-found page.
  myAccess: protectedProcedureWithoutAccess
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      const access = await ctx.services.auth.getOrganizationAccess({
        userId,
        organizationId: input.organizationId,
      });
      if (!access) {
        return null;
      }
      return { role: access.role };
    }),

  update: protectedProcedure
    .input(zEditOrganization)
    .mutation(async ({ input, ctx }) => {
      await requireOrgAdmin(ctx, input.id);
      return ctx.services.organization.update(input);
    }),

  delete: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await requireOrgAdmin(ctx, input.organizationId);
      await ctx.services.organization.scheduleDeletion(input.organizationId);
      return true;
    }),

  cancelDeletion: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await requireOrgAdmin(ctx, input.organizationId);
      await ctx.services.organization.cancelDeletion(input.organizationId);
      return true;
    }),

  inviteUser: protectedProcedure
    .input(zInviteUser)
    .mutation(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await requireOrgAdmin(ctx, input.organizationId);
      return ctx.services.organization.inviteUser({
        organizationId: input.organizationId,
        email: input.email,
        role: input.role,
        access: input.access,
        invitedById: userId,
      });
    }),

  revokeInvite: protectedProcedure
    .input(z.object({ inviteId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      requireLogin(ctx.session.userId);
      const invite = await ctx.services.organization.getInviteOrThrow(
        input.inviteId
      );
      await requireOrgAdmin(ctx, invite.organizationId);
      return ctx.services.organization.revokeInvite(input.inviteId);
    }),

  removeMember: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        userId: z.string(),
        id: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const requestedByUserId = requireLogin(ctx.session.userId);
      await requireOrgAdmin(ctx, input.organizationId);
      await ctx.services.organization.removeMember({
        organizationId: input.organizationId,
        memberId: input.id,
        targetUserId: input.userId,
        requestedByUserId,
      });
    }),

  updateMemberAccess: protectedProcedure
    .input(zUpdateMemberAccess)
    .mutation(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      if (input.userId === userId) {
        throw new TRPCForbiddenError('You cannot update your own access');
      }
      await requireOrgAdmin(ctx, input.organizationId);
      return ctx.services.organization.updateMemberAccess({
        organizationId: input.organizationId,
        targetUserId: input.userId,
        access: input.access,
      });
    }),

  members: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input, ctx }) => {
      await requireOrgAdmin(ctx, input.organizationId);
      return ctx.services.organization.members(input.organizationId);
    }),

  invitations: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input, ctx }) => {
      await requireOrgAdmin(ctx, input.organizationId);
      return ctx.services.organization.invitations(input.organizationId);
    }),

  getInvite: publicProcedure
    .input(z.object({ inviteId: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      if (!input.inviteId) {
        throw new TRPCBadRequestError('Invite ID is required');
      }
      return ctx.services.organization.getInvite(input.inviteId);
    }),
});
