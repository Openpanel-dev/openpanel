// Ported from packages/trpc/src/routers/session.ts (M7-001).
//
// M11-001: every procedure is on its V1 twin's builder.
// `protectedProcedure` runs `enforceUserIsAuthed` + `enforceAccess` BEFORE
// the input parser, exactly as V1 does. The explicit checks in the handlers
// below stay: `enforceAccess` only sees a TOP-LEVEL `projectId` /
// `organizationId`, so anything resolved from another id needs its own
// (ADR-011).
//
// V1's file also exported `encodeCursor` / `decodeCursor`; nothing imports
// them and `shared/pagination.ts` already has the generic pair, so they were
// not ported.

import { zChartEventFilter } from '@openpanel/validation';
import { z } from 'zod';
import {
  createTRPCRouter,
  protectedProcedure,
  type TrpcContext,
} from '../../rpc/base';
import { TRPCAccessError } from '../../rpc/errors';
import {
  getSessionById,
  getSessionDistinctValues,
  getSessionList,
  getSessionReplayChunksFrom,
  SESSION_DISTINCT_FIELDS,
} from './session.service';

const DEFAULT_LIST_TAKE = 50;

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

export const sessionRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        profileId: z.string().optional(),
        cursor: z.string().nullish(),
        filters: z.array(zChartEventFilter).default([]),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        search: z.string().optional(),
        take: z.number().default(DEFAULT_LIST_TAKE),
      })
    )
    .query(async ({ input, ctx }) => {
      await requireReadAccess(ctx, input.projectId);

      return getSessionList(ctx, {
        ...input,
        cursor: input.cursor ? new Date(input.cursor) : undefined,
      });
    }),

  distinctValues: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        field: z.enum(SESSION_DISTINCT_FIELDS),
      })
    )
    .query(async ({ input, ctx }) => {
      await requireReadAccess(ctx, input.projectId);

      return getSessionDistinctValues(ctx, input.projectId, input.field);
    }),

  byId: protectedProcedure
    .input(z.object({ sessionId: z.string(), projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      await requireReadAccess(ctx, input.projectId);

      return getSessionById(ctx, input.sessionId, input.projectId);
    }),

  replayChunksFrom: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        projectId: z.string(),
        fromIndex: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      await requireReadAccess(ctx, input.projectId);

      return getSessionReplayChunksFrom(
        ctx,
        input.sessionId,
        input.projectId,
        input.fromIndex
      );
    }),
});
