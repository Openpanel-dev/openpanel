// Ported from packages/trpc/src/routers/group.ts (M7-002).
//
// M11-001: every procedure is on its V1 twin's builder.
// `protectedProcedure` runs `enforceUserIsAuthed` + `enforceAccess` BEFORE
// the input parser, exactly as V1 does. The explicit checks in the handlers
// below stay: `enforceAccess` only sees a TOP-LEVEL `projectId` /
// `organizationId`, so anything resolved from another id needs its own
// (ADR-011).

import { z } from 'zod';
import {
  createTRPCRouter,
  protectedProcedure,
  type TrpcContext,
} from '../../rpc/base';
import { TRPCAccessError } from '../../rpc/errors';
import { zCreateGroup, zUpdateGroup } from './group.constants';
import {
  createGroup,
  deleteGroup,
  getGroupActivity,
  getGroupById,
  getGroupListPage,
  getGroupMemberGrowth,
  getGroupMemberProfilesPage,
  getGroupMetrics,
  getGroupMostEvents,
  getGroupPopularRoutes,
  getGroupPropertyKeys,
  getGroupsByIds,
  getGroupTypes,
  updateGroup,
} from './group.service';

const DEFAULT_LIST_TAKE = 50;

const zGroupRef = z.object({ id: z.string(), projectId: z.string() });

function requireLogin(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCAccessError('Not authenticated');
  }
  return userId;
}

async function requireAccess(
  ctx: TrpcContext,
  projectId: string,
  level: 'read' | 'write'
) {
  await ctx.services.auth.requireProjectAccess({
    userId: requireLogin(ctx.session.userId),
    projectId,
    level,
  });
}

export const groupRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        cursor: z.number().optional(),
        take: z.number().default(DEFAULT_LIST_TAKE),
        search: z.string().optional(),
        type: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      await requireAccess(ctx, input.projectId, 'read');

      return getGroupListPage(ctx, input);
    }),

  byId: protectedProcedure.input(zGroupRef).query(async ({ input, ctx }) => {
    await requireAccess(ctx, input.projectId, 'read');

    return getGroupById(ctx, input.id, input.projectId);
  }),

  create: protectedProcedure
    .input(zCreateGroup)
    .mutation(async ({ input, ctx }) => {
      await requireAccess(ctx, input.projectId, 'write');

      return createGroup(ctx, input);
    }),

  update: protectedProcedure
    .input(zUpdateGroup)
    .mutation(async ({ input, ctx }) => {
      await requireAccess(ctx, input.projectId, 'write');

      const { id, projectId, ...data } = input;
      return updateGroup(ctx, id, projectId, data);
    }),

  delete: protectedProcedure
    .input(zGroupRef)
    .mutation(async ({ input, ctx }) => {
      await requireAccess(ctx, input.projectId, 'write');

      return deleteGroup(ctx, input.id, input.projectId);
    }),

  types: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      await requireAccess(ctx, input.projectId, 'read');

      return getGroupTypes(ctx, input.projectId);
    }),

  metrics: protectedProcedure.input(zGroupRef).query(async ({ input, ctx }) => {
    await requireAccess(ctx, input.projectId, 'read');

    return getGroupMetrics(ctx, input.id, input.projectId);
  }),

  activity: protectedProcedure
    .input(zGroupRef)
    .query(async ({ input, ctx }) => {
      await requireAccess(ctx, input.projectId, 'read');

      return getGroupActivity(ctx, input.id, input.projectId);
    }),

  memberGrowth: protectedProcedure
    .input(zGroupRef)
    .query(async ({ input, ctx }) => {
      await requireAccess(ctx, input.projectId, 'read');

      return getGroupMemberGrowth(ctx, input.id, input.projectId);
    }),

  listProfiles: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        groupId: z.string(),
        cursor: z.number().optional(),
        take: z.number().default(DEFAULT_LIST_TAKE),
        search: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      await requireAccess(ctx, input.projectId, 'read');

      return getGroupMemberProfilesPage(ctx, input);
    }),

  mostEvents: protectedProcedure
    .input(zGroupRef)
    .query(async ({ input, ctx }) => {
      await requireAccess(ctx, input.projectId, 'read');

      return getGroupMostEvents(ctx, input.id, input.projectId);
    }),

  popularRoutes: protectedProcedure
    .input(zGroupRef)
    .query(async ({ input, ctx }) => {
      await requireAccess(ctx, input.projectId, 'read');

      return getGroupPopularRoutes(ctx, input.id, input.projectId);
    }),

  properties: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      await requireAccess(ctx, input.projectId, 'read');

      return getGroupPropertyKeys(ctx, input.projectId);
    }),

  listByIds: protectedProcedure
    .input(z.object({ projectId: z.string(), ids: z.array(z.string()) }))
    .query(async ({ input, ctx }) => {
      await requireAccess(ctx, input.projectId, 'read');

      return getGroupsByIds(ctx, input.projectId, input.ids);
    }),
});
