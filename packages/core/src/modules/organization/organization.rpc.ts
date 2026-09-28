//
// Every procedure is on its V1 twin's builder. `protectedProcedure` runs
// `enforceUserIsAuthed` + `enforceAccess` BEFORE the input parser, exactly as
// V1 does. The explicit checks in the handlers below stay: `enforceAccess` only
// sees a TOP-LEVEL `projectId` / `organizationId`, so anything resolved from
// another id needs its own.
//
// The organization-admin ladder itself is bound once, in auth.service.ts; every
// procedure here reaches it through `ctx.services.auth`.
//
// `getInvite` still drops V1's rate limiting: `rateLimitMiddleware` did NOT
// move with M11-001. `createRateLimitMiddleware` in rpc/base.ts is the seam
// that will carry it.

import { z } from 'zod';
import {
  createTRPCRouter,
  protectedProcedure,
  protectedProcedureWithoutAccess,
  publicProcedure,
} from '../../rpc/base';
import { TRPCBadRequestError, TRPCForbiddenError } from '../../rpc/errors';
import {
  zEditOrganization,
  zInviteUser,
  zUpdateMemberAccess,
} from './organization.constants';

export const organizationRouter = createTRPCRouter({
  get: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input, ctx }) => {
      return ctx.services.organization.get(input.organizationId);
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.userId;
    return ctx.services.organization.list(userId);
  }),

  // Membership-exempt on purpose: any logged-in user may ask whether they have
  // access to a given org. Returns null when they're not a member (instead of
  // throwing), which the org-layout guard uses to render a not-found page.
  myAccess: protectedProcedureWithoutAccess
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.session.userId;
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
      await ctx.services.auth.requireOrganizationAdmin({
        userId: ctx.session.userId,
        organizationId: input.id,
      });
      return ctx.services.organization.update(input);
    }),

  delete: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await ctx.services.auth.requireOrganizationAdmin({
        userId: ctx.session.userId,
        organizationId: input.organizationId,
      });
      await ctx.services.organization.scheduleDeletion(input.organizationId);
      return true;
    }),

  cancelDeletion: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await ctx.services.auth.requireOrganizationAdmin({
        userId: ctx.session.userId,
        organizationId: input.organizationId,
      });
      await ctx.services.organization.cancelDeletion(input.organizationId);
      return true;
    }),

  inviteUser: protectedProcedure
    .input(zInviteUser)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.userId;
      await ctx.services.auth.requireOrganizationAdmin({
        userId: ctx.session.userId,
        organizationId: input.organizationId,
      });
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
      const invite = await ctx.services.organization.getInviteOrThrow(
        input.inviteId
      );
      await ctx.services.auth.requireOrganizationAdmin({
        userId: ctx.session.userId,
        organizationId: invite.organizationId,
      });
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
      const requestedByUserId = ctx.session.userId;
      await ctx.services.auth.requireOrganizationAdmin({
        userId: ctx.session.userId,
        organizationId: input.organizationId,
      });
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
      const userId = ctx.session.userId;
      if (input.userId === userId) {
        throw new TRPCForbiddenError('You cannot update your own access');
      }
      await ctx.services.auth.requireOrganizationAdmin({
        userId: ctx.session.userId,
        organizationId: input.organizationId,
      });
      return ctx.services.organization.updateMemberAccess({
        organizationId: input.organizationId,
        targetUserId: input.userId,
        access: input.access,
      });
    }),

  members: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireOrganizationAdmin({
        userId: ctx.session.userId,
        organizationId: input.organizationId,
      });
      return ctx.services.organization.members(input.organizationId);
    }),

  invitations: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireOrganizationAdmin({
        userId: ctx.session.userId,
        organizationId: input.organizationId,
      });
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
