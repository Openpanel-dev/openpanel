// Ported from packages/trpc/src/routers/realtime.ts (M6-007).
//
// V1's `protectedProcedure` — the logger/session-scope/rate-limit middleware
// stack — lands in core with auth (rpc/base.ts: "those need the resolved
// Session shape and the access rules, so they land with auth (P6)"). Until
// then this router does its own minimal "is anyone logged in" + explicit
// `requireProjectAccess({ level: 'read' })` check per procedure, exactly like
// V1's `enforceUserIsAuthed` + `enforceAccess` middleware pair does implicitly
// off the `projectId` input. packages/trpc's realtime router now DELEGATES
// its handler bodies onto `./realtime.service`'s query functions (same as
// notification.ts/reference.ts) while keeping V1's own full
// `protectedProcedure` stack — so the queries have one implementation, called
// through two access-check paths until the ONE shared tRPC instance lands
// with auth (P6).
//
// The per-project access ladder itself IS shared: `./src/access.ts` binds
// core's shared/access.ts ladder to @openpanel/db's real lookups, the same
// way packages/trpc/src/access.ts does for V1.

import { z } from 'zod';
import { createTRPCRouter, procedure } from '../../rpc/base';
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

function loadAccessChecks() {
  return import('./src/access');
}

function requireLogin(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCAccessError('Not authenticated');
  }
  return userId;
}

async function requireReadAccess(userId: string, projectId: string) {
  const { requireProjectAccess } = await loadAccessChecks();
  await requireProjectAccess({ userId, projectId, level: 'read' });
}

export const realtimeRouter = createTRPCRouter({
  coordinates: procedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await requireReadAccess(userId, input.projectId);

      return getRealtimeCoordinates(input.projectId);
    }),
  mapBadgeDetails: procedure
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
      const userId = requireLogin(ctx.session.userId);
      await requireReadAccess(userId, input.projectId);

      return getRealtimeMapBadgeDetails(input);
    }),
  activeSessions: procedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await requireReadAccess(userId, input.projectId);

      return getRealtimeActiveSessions(input.projectId);
    }),
  paths: procedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await requireReadAccess(userId, input.projectId);

      return getRealtimePaths(input.projectId);
    }),
  referrals: procedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await requireReadAccess(userId, input.projectId);

      return getRealtimeReferrals(input.projectId);
    }),
  geo: procedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await requireReadAccess(userId, input.projectId);

      return getRealtimeGeo(input.projectId);
    }),
});
