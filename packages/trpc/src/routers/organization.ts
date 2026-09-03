// Dissolved into @openpanel/core's organization module (M6-001): the CRUD
// and mutation bodies moved to
// packages/core/src/modules/organization/organization.service.ts (delete.service.ts
// folded in with it). This router stays (DELEGATE PATTERN) — it keeps V1's
// protectedProcedure stack (session/access/logger/rate-limit middleware) and
// delegates every handler body to core's organization functions, same as
// conversation's router does (M5-006).
import {
  cancelOrganizationDeletion,
  getInviteById,
  getInviteOrThrow,
  getMembers,
  getOrganizationById,
  getOrganizations,
  inviteUserToOrganization,
  getInvites as loadInvites,
  removeOrganizationMember,
  revokeInvite as revokeInviteById,
  scheduleOrganizationDeletion,
  updateOrganization,
  updateOrganizationMemberAccess,
} from '@openpanel/core';
import {
  zEditOrganization,
  zInviteUser,
  zUpdateMemberAccess,
} from '@openpanel/validation';
import { z } from 'zod';
import { getOrganizationAccess } from '../access';
import { TRPCBadRequestError, TRPCForbiddenError } from '../errors';
import {
  createTRPCRouter,
  protectedProcedure,
  protectedProcedureWithoutAccess,
  publicProcedure,
  rateLimitMiddleware,
} from '../trpc';

export const organizationRouter = createTRPCRouter({
  get: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      return getOrganizationById(input.organizationId);
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    return getOrganizations(ctx.session.userId);
  }),

  // Membership-exempt on purpose: any logged-in user may ask whether they have
  // access to a given org. Returns null when they're not a member (instead of
  // throwing), which the org-layout guard uses to render a not-found page.
  myAccess: protectedProcedureWithoutAccess
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input, ctx }) => {
      const access = await getOrganizationAccess({
        userId: ctx.session.userId,
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
      const access = await getOrganizationAccess({
        userId: ctx.session.userId,
        organizationId: input.id,
      });

      if (access?.role !== 'org:admin') {
        throw new TRPCForbiddenError('You do not have access to this project');
      }

      return updateOrganization(input);
    }),

  delete: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const access = await getOrganizationAccess({
        userId: ctx.session.userId,
        organizationId: input.organizationId,
      });

      if (access?.role !== 'org:admin') {
        throw new TRPCForbiddenError(
          'You do not have access to this organization'
        );
      }

      // Schedules the organization and all of its projects for deletion in 24
      // hours (cancelable until then); throws if a live paid subscription
      // hasn't been cancelled yet. The hourly `delete` cron removes the
      // projects (and their ClickHouse events) and the organization in a
      // single pass once their `deleteAt` has passed.
      await scheduleOrganizationDeletion(input.organizationId);

      return true;
    }),

  cancelDeletion: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const access = await getOrganizationAccess({
        userId: ctx.session.userId,
        organizationId: input.organizationId,
      });

      if (access?.role !== 'org:admin') {
        throw new TRPCForbiddenError(
          'You do not have access to this organization'
        );
      }

      await cancelOrganizationDeletion(input.organizationId);

      return true;
    }),

  inviteUser: protectedProcedure
    .input(zInviteUser)
    .mutation(async ({ input, ctx }) => {
      const access = await getOrganizationAccess({
        userId: ctx.session.userId,
        organizationId: input.organizationId,
      });

      if (access?.role !== 'org:admin') {
        throw new TRPCForbiddenError('You do not have access to this project');
      }

      return inviteUserToOrganization({
        organizationId: input.organizationId,
        email: input.email,
        role: input.role,
        access: input.access ?? [],
        invitedById: ctx.session.userId,
      });
    }),
  revokeInvite: protectedProcedure
    .input(
      z.object({
        inviteId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const invite = await getInviteOrThrow(input.inviteId);

      const access = await getOrganizationAccess({
        userId: ctx.session.userId,
        organizationId: invite.organizationId,
      });

      if (access?.role !== 'org:admin') {
        throw new TRPCForbiddenError('You do not have access to this project');
      }

      return revokeInviteById(input.inviteId);
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
      const access = await getOrganizationAccess({
        userId: ctx.session.userId,
        organizationId: input.organizationId,
      });

      if (access?.role !== 'org:admin') {
        throw new TRPCForbiddenError('You do not have access to this project');
      }

      await removeOrganizationMember({
        organizationId: input.organizationId,
        memberId: input.id,
        targetUserId: input.userId,
        requestedByUserId: ctx.session.userId,
      });
    }),

  updateMemberAccess: protectedProcedure
    .input(zUpdateMemberAccess)
    .mutation(async ({ input, ctx }) => {
      if (input.userId === ctx.session.userId) {
        throw new TRPCForbiddenError('You cannot update your own access');
      }

      const access = await getOrganizationAccess({
        userId: ctx.session.userId,
        organizationId: input.organizationId,
      });

      if (access?.role !== 'org:admin') {
        throw new TRPCForbiddenError('You do not have access to this project');
      }

      return updateOrganizationMemberAccess({
        organizationId: input.organizationId,
        targetUserId: input.userId,
        access: input.access,
      });
    }),

  members: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input, ctx }) => {
      const access = await getOrganizationAccess({
        userId: ctx.session.userId,
        organizationId: input.organizationId,
      });
      if (access?.role !== 'org:admin') {
        throw new TRPCForbiddenError('You do not have access to this project');
      }
      return getMembers(input.organizationId);
    }),

  invitations: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input, ctx }) => {
      const access = await getOrganizationAccess({
        userId: ctx.session.userId,
        organizationId: input.organizationId,
      });
      if (access?.role !== 'org:admin') {
        throw new TRPCForbiddenError('You do not have access to this project');
      }
      return loadInvites(input.organizationId);
    }),

  getInvite: publicProcedure
    .use(
      rateLimitMiddleware({
        max: 5,
        windowMs: 30_000,
      })
    )
    .input(z.object({ inviteId: z.string().optional() }))
    .query(async ({ input }) => {
      if (!input.inviteId) {
        throw new TRPCBadRequestError('Invite ID is required');
      }
      return getInviteById(input.inviteId);
    }),
});
