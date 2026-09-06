// Ported from packages/trpc/src/routers/realtime.ts (M6-007).
//
// M11-001: every procedure is on its V1 twin's builder.
// `protectedProcedure` runs `enforceUserIsAuthed` + `enforceAccess` BEFORE
// the input parser, exactly as V1 does. The explicit checks in the handlers
// below stay: `enforceAccess` only sees a TOP-LEVEL `projectId` /
// `organizationId`, so anything resolved from another id needs its own
// (ADR-011).
//
// Each procedure also calls `requireProjectAccess({ level: 'read' })`
// explicitly; `enforceAccess` already does the same off the `projectId`
// input, and the redundant call is kept deliberately (ADR-011).
//
// The permission ladder itself is bound once, in auth.service.ts
// (M10-002); every procedure here reaches it through `ctx.services.auth`.

import { z } from 'zod';
import {
  createTRPCRouter,
  protectedProcedure,
  type TrpcContext,
} from '../../rpc/base';
import { TRPCAccessError } from '../../rpc/errors';
import {
  getRealtimeActiveSessions,
  getRealtimeCoordinates,
  getRealtimeGeo,
  getRealtimeMapBadgeDetails,
  getRealtimePaths,
  getRealtimeReferrals,
} from './realtime.service';

const MAP_BADGE_LOCATIONS_MIN = 1;
const MAP_BADGE_LOCATIONS_MAX = 200;

const realtimeLocationSchema = z.object({
  country: z.string().optional(),
  city: z.string().optional(),
  lat: z.number().optional(),
  long: z.number().optional(),
});

const realtimeBadgeDetailScopeSchema = z.enum([
  'country',
  'city',
  'coordinate',
  'merged',
]);

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

export const realtimeRouter = createTRPCRouter({
  coordinates: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      await requireReadAccess(ctx, input.projectId);

      return getRealtimeCoordinates(ctx, input.projectId);
    }),
  mapBadgeDetails: protectedProcedure
    .input(
      z.object({
        detailScope: realtimeBadgeDetailScopeSchema,
        projectId: z.string(),
        locations: z
          .array(realtimeLocationSchema)
          .min(MAP_BADGE_LOCATIONS_MIN)
          .max(MAP_BADGE_LOCATIONS_MAX),
      })
    )
    .query(async ({ input, ctx }) => {
      await requireReadAccess(ctx, input.projectId);

      return getRealtimeMapBadgeDetails(ctx, input);
    }),
  activeSessions: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      await requireReadAccess(ctx, input.projectId);

      return getRealtimeActiveSessions(ctx, input.projectId);
    }),
  paths: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      await requireReadAccess(ctx, input.projectId);

      return getRealtimePaths(ctx, input.projectId);
    }),
  referrals: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      await requireReadAccess(ctx, input.projectId);

      return getRealtimeReferrals(ctx, input.projectId);
    }),
  geo: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      await requireReadAccess(ctx, input.projectId);

      return getRealtimeGeo(ctx, input.projectId);
    }),
});
