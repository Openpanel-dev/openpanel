// Ported from packages/trpc/src/routers/group.ts (M7-002).
//
// Same arrangement as session.rpc.ts: V1's `protectedProcedure` stack lands
// with auth (P6), so until then each procedure does its own "is anyone logged
// in" + `requireProjectAccess` off the `projectId` input (`read` for queries,
// `write` for the three mutations), which is what V1's `enforceUserIsAuthed`
// + `enforceAccess` middleware pair does implicitly. packages/trpc's group
// router delegates its handler bodies onto `./group.service` while keeping
// V1's own `protectedProcedure` stack.

import { z } from 'zod';
import { createTRPCRouter, procedure, type TrpcContext } from '../../rpc/base';
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
  list: procedure
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

      return getGroupListPage(input);
    }),

  byId: procedure.input(zGroupRef).query(async ({ input, ctx }) => {
    await requireAccess(ctx, input.projectId, 'read');

    return getGroupById(input.id, input.projectId);
  }),

  create: procedure.input(zCreateGroup).mutation(async ({ input, ctx }) => {
    await requireAccess(ctx, input.projectId, 'write');

    return createGroup(input);
  }),

  update: procedure.input(zUpdateGroup).mutation(async ({ input, ctx }) => {
    await requireAccess(ctx, input.projectId, 'write');

    const { id, projectId, ...data } = input;
    return updateGroup(id, projectId, data);
  }),

  delete: procedure.input(zGroupRef).mutation(async ({ input, ctx }) => {
    await requireAccess(ctx, input.projectId, 'write');

    return deleteGroup(input.id, input.projectId);
  }),

  types: procedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      await requireAccess(ctx, input.projectId, 'read');

      return getGroupTypes(input.projectId);
    }),

  metrics: procedure.input(zGroupRef).query(async ({ input, ctx }) => {
    await requireAccess(ctx, input.projectId, 'read');

    return getGroupMetrics(input.id, input.projectId);
  }),

  activity: procedure.input(zGroupRef).query(async ({ input, ctx }) => {
    await requireAccess(ctx, input.projectId, 'read');

    return getGroupActivity(input.id, input.projectId);
  }),

  memberGrowth: procedure.input(zGroupRef).query(async ({ input, ctx }) => {
    await requireAccess(ctx, input.projectId, 'read');

    return getGroupMemberGrowth(input.id, input.projectId);
  }),

  listProfiles: procedure
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

      return getGroupMemberProfilesPage(input);
    }),

  mostEvents: procedure.input(zGroupRef).query(async ({ input, ctx }) => {
    await requireAccess(ctx, input.projectId, 'read');

    return getGroupMostEvents(input.id, input.projectId);
  }),

  popularRoutes: procedure.input(zGroupRef).query(async ({ input, ctx }) => {
    await requireAccess(ctx, input.projectId, 'read');

    return getGroupPopularRoutes(input.id, input.projectId);
  }),

  properties: procedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      await requireAccess(ctx, input.projectId, 'read');

      return getGroupPropertyKeys(input.projectId);
    }),

  listByIds: procedure
    .input(z.object({ projectId: z.string(), ids: z.array(z.string()) }))
    .query(async ({ input, ctx }) => {
      await requireAccess(ctx, input.projectId, 'read');

      return getGroupsByIds(input.projectId, input.ids);
    }),
});
