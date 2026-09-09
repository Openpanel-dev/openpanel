// Ported from packages/trpc/src/routers/group.ts (M7-002).
//
// M11-001: every procedure is on its V1 twin's builder.
// `protectedProcedure` runs `enforceUserIsAuthed` + `enforceAccess` BEFORE
// the input parser, exactly as V1 does. Every procedure below carries a
// top-level `projectId`, so `enforceAccess` already covers it (ADR-011) - the
// explicit `requireProjectAccess` calls in the handlers are the tree-wide
// M15-007 pattern (ADR-022 R10), not the resolved-from-another-id exception.

import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../../rpc/base';
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
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });

      return getGroupListPage(ctx, input);
    }),

  byId: protectedProcedure.input(zGroupRef).query(async ({ input, ctx }) => {
    await ctx.services.auth.requireProjectAccess({
      userId: ctx.session.userId,
      projectId: input.projectId,
      level: 'read',
    });

    return getGroupById(ctx, input.id, input.projectId);
  }),

  create: protectedProcedure
    .input(zCreateGroup)
    .mutation(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'write',
      });

      return createGroup(ctx, input);
    }),

  update: protectedProcedure
    .input(zUpdateGroup)
    .mutation(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'write',
      });

      const { id, projectId, ...data } = input;
      return updateGroup(ctx, id, projectId, data);
    }),

  delete: protectedProcedure
    .input(zGroupRef)
    .mutation(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'write',
      });

      return deleteGroup(ctx, input.id, input.projectId);
    }),

  types: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });

      return getGroupTypes(ctx, input.projectId);
    }),

  metrics: protectedProcedure.input(zGroupRef).query(async ({ input, ctx }) => {
    await ctx.services.auth.requireProjectAccess({
      userId: ctx.session.userId,
      projectId: input.projectId,
      level: 'read',
    });

    return getGroupMetrics(ctx, input.id, input.projectId);
  }),

  activity: protectedProcedure
    .input(zGroupRef)
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });

      return getGroupActivity(ctx, input.id, input.projectId);
    }),

  memberGrowth: protectedProcedure
    .input(zGroupRef)
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });

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
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });

      return getGroupMemberProfilesPage(ctx, input);
    }),

  mostEvents: protectedProcedure
    .input(zGroupRef)
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });

      return getGroupMostEvents(ctx, input.id, input.projectId);
    }),

  popularRoutes: protectedProcedure
    .input(zGroupRef)
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });

      return getGroupPopularRoutes(ctx, input.id, input.projectId);
    }),

  properties: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });

      return getGroupPropertyKeys(ctx, input.projectId);
    }),

  listByIds: protectedProcedure
    .input(z.object({ projectId: z.string(), ids: z.array(z.string()) }))
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });

      return getGroupsByIds(ctx, input.projectId, input.ids);
    }),
});
