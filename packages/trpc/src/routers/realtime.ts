// Dissolved into @openpanel/core's realtime module (M6-007): the six
// ClickHouse queries moved to
// packages/core/src/modules/realtime/realtime.service.ts. This router stays
// (DELEGATE PATTERN) — it keeps V1's protectedProcedure stack
// (session/access/logger/rate-limit middleware, which already enforces
// `projectId` read access via `enforceAccess`) and delegates every handler
// body to core's realtime functions, same as notification.ts/reference.ts.
//
// V1's Fastify `/live` websocket controller is untouched (ADR-002/M6-007
// notes: its `ws`-package socket has nothing in common with Elysia/Bun's
// `ElysiaWS`), so this file has no ws surface to delegate — that logic was
// ported fresh into core/realtime.routes.ts instead.

import {
  getRealtimeActiveSessions,
  getRealtimeCoordinates,
  getRealtimeGeo,
  getRealtimeMapBadgeDetails,
  getRealtimePaths,
  getRealtimeReferrals,
} from '@openpanel/core';
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../trpc';

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

export const realtimeRouter = createTRPCRouter({
  coordinates: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      return getRealtimeCoordinates(input.projectId);
    }),
  mapBadgeDetails: protectedProcedure
    .input(
      z.object({
        detailScope: realtimeBadgeDetailScopeSchema,
        projectId: z.string(),
        locations: z.array(realtimeLocationSchema).min(1).max(200),
      })
    )
    .query(async ({ input }) => {
      return getRealtimeMapBadgeDetails(input);
    }),
  activeSessions: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      return getRealtimeActiveSessions(input.projectId);
    }),
  paths: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      return getRealtimePaths(input.projectId);
    }),
  referrals: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      return getRealtimeReferrals(input.projectId);
    }),
  geo: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      return getRealtimeGeo(input.projectId);
    }),
});
