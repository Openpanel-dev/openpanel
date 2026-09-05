// Ported from packages/trpc/src/routers/profile.ts (M7-002).
//
// Same arrangement as session.rpc.ts: V1's `protectedProcedure` stack lands
// with auth (P6), so until then each procedure does its own "is anyone logged
// in" + `requireProjectAccess({ level: 'read' })` off the `projectId` input,
// which is what V1's `enforceUserIsAuthed` + `enforceAccess` middleware pair
// does implicitly. packages/trpc's profile router delegates its handler
// bodies onto `./profile.service` while keeping V1's own `protectedProcedure`
// stack.

import { zChartEventFilter } from '@openpanel/validation';
import { z } from 'zod';
import { createTRPCRouter, procedure, type TrpcContext } from '../../rpc/base';
import { TRPCAccessError } from '../../rpc/errors';
import {
  getPowerUsers,
  getProfileActivity,
  getProfileById,
  getProfileListPage,
  getProfileMetrics,
  getProfileMostEvents,
  getProfilePopularRoutes,
  getProfilePropertyNames,
  getProfileValues,
} from './profile.service';

const DEFAULT_LIST_TAKE = 50;

const zProfileRef = z.object({ profileId: z.string(), projectId: z.string() });

function requireLogin(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCAccessError('Not authenticated');
  }
  return userId;
}

async function requireReadAccess(ctx: TrpcContext, projectId: string) {
  await ctx.services.auth.requireProjectAccess({
    userId: requireLogin(ctx.session.userId),
    projectId,
    level: 'read',
  });
}

export const profileRouter = createTRPCRouter({
  byId: procedure.input(zProfileRef).query(async ({ input, ctx }) => {
    await requireReadAccess(ctx, input.projectId);

    return getProfileById(input.profileId, input.projectId);
  }),

  metrics: procedure.input(zProfileRef).query(async ({ input, ctx }) => {
    await requireReadAccess(ctx, input.projectId);

    return getProfileMetrics(input.profileId, input.projectId);
  }),

  activity: procedure.input(zProfileRef).query(async ({ input, ctx }) => {
    await requireReadAccess(ctx, input.projectId);

    return getProfileActivity(input.profileId, input.projectId);
  }),

  mostEvents: procedure.input(zProfileRef).query(async ({ input, ctx }) => {
    await requireReadAccess(ctx, input.projectId);

    return getProfileMostEvents(input.profileId, input.projectId);
  }),

  popularRoutes: procedure.input(zProfileRef).query(async ({ input, ctx }) => {
    await requireReadAccess(ctx, input.projectId);

    return getProfilePopularRoutes(input.profileId, input.projectId);
  }),

  properties: procedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      await requireReadAccess(ctx, input.projectId);

      return getProfilePropertyNames(input.projectId);
    }),

  list: procedure
    .input(
      z.object({
        projectId: z.string(),
        cursor: z.number().optional(),
        take: z.number().default(DEFAULT_LIST_TAKE),
        search: z.string().optional(),
        isExternal: z.boolean().optional(),
        filters: z.array(zChartEventFilter).default([]),
      })
    )
    .query(async ({ input, ctx }) => {
      await requireReadAccess(ctx, input.projectId);

      return getProfileListPage(input);
    }),

  powerUsers: procedure
    .input(
      z.object({
        projectId: z.string(),
        cursor: z.number().optional(),
        take: z.number().default(DEFAULT_LIST_TAKE),
      })
    )
    .query(async ({ input, ctx }) => {
      await requireReadAccess(ctx, input.projectId);

      return getPowerUsers(input);
    }),

  values: procedure
    .input(z.object({ property: z.string(), projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      await requireReadAccess(ctx, input.projectId);

      return getProfileValues(input);
    }),
});
