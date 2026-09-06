// Ported from packages/trpc/src/routers/profile.ts (M7-002).
//
// M11-001: every procedure is on its V1 twin's builder.
// `protectedProcedure` runs `enforceUserIsAuthed` + `enforceAccess` BEFORE
// the input parser, exactly as V1 does. The explicit checks in the handlers
// below stay: `enforceAccess` only sees a TOP-LEVEL `projectId` /
// `organizationId`, so anything resolved from another id needs its own
// (ADR-011).

import { zChartEventFilter } from '@openpanel/validation';
import { z } from 'zod';
import {
  createTRPCRouter,
  protectedProcedure,
  type TrpcContext,
} from '../../rpc/base';
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
  byId: protectedProcedure.input(zProfileRef).query(async ({ input, ctx }) => {
    await requireReadAccess(ctx, input.projectId);

    return getProfileById(ctx, input.profileId, input.projectId);
  }),

  metrics: protectedProcedure
    .input(zProfileRef)
    .query(async ({ input, ctx }) => {
      await requireReadAccess(ctx, input.projectId);

      return getProfileMetrics(ctx, input.profileId, input.projectId);
    }),

  activity: protectedProcedure
    .input(zProfileRef)
    .query(async ({ input, ctx }) => {
      await requireReadAccess(ctx, input.projectId);

      return getProfileActivity(ctx, input.profileId, input.projectId);
    }),

  mostEvents: protectedProcedure
    .input(zProfileRef)
    .query(async ({ input, ctx }) => {
      await requireReadAccess(ctx, input.projectId);

      return getProfileMostEvents(ctx, input.profileId, input.projectId);
    }),

  popularRoutes: protectedProcedure
    .input(zProfileRef)
    .query(async ({ input, ctx }) => {
      await requireReadAccess(ctx, input.projectId);

      return getProfilePopularRoutes(ctx, input.profileId, input.projectId);
    }),

  properties: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      await requireReadAccess(ctx, input.projectId);

      return getProfilePropertyNames(ctx, input.projectId);
    }),

  list: protectedProcedure
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

      return getProfileListPage(ctx, input);
    }),

  powerUsers: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        cursor: z.number().optional(),
        take: z.number().default(DEFAULT_LIST_TAKE),
      })
    )
    .query(async ({ input, ctx }) => {
      await requireReadAccess(ctx, input.projectId);

      return getPowerUsers(ctx, input);
    }),

  values: protectedProcedure
    .input(z.object({ property: z.string(), projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      await requireReadAccess(ctx, input.projectId);

      return getProfileValues(ctx, input);
    }),
});
