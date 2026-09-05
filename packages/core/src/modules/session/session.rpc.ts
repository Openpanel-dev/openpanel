// Ported from packages/trpc/src/routers/session.ts (M7-001).
//
// Same arrangement as realtime.rpc.ts: V1's `protectedProcedure` stack lands
// with auth (P6), so until then each procedure does its own "is anyone logged
// in" + `requireProjectAccess({ level: 'read' })` off the `projectId` input,
// which is what V1's `enforceUserIsAuthed` + `enforceAccess` middleware pair
// does implicitly. packages/trpc's session router delegates its handler bodies
// onto `./session.service` while keeping V1's own `protectedProcedure` stack.
//
// V1's file also exported `encodeCursor` / `decodeCursor`; nothing imports
// them and `shared/pagination.ts` already has the generic pair, so they were
// not ported.

import { zChartEventFilter } from '@openpanel/validation';
import { z } from 'zod';
import { createTRPCRouter, procedure, type TrpcContext } from '../../rpc/base';
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
  list: procedure
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

      return getSessionList({
        ...input,
        cursor: input.cursor ? new Date(input.cursor) : undefined,
      });
    }),

  distinctValues: procedure
    .input(
      z.object({
        projectId: z.string(),
        field: z.enum(SESSION_DISTINCT_FIELDS),
      })
    )
    .query(async ({ input, ctx }) => {
      await requireReadAccess(ctx, input.projectId);

      return getSessionDistinctValues(input.projectId, input.field);
    }),

  byId: procedure
    .input(z.object({ sessionId: z.string(), projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      await requireReadAccess(ctx, input.projectId);

      return getSessionById(input.sessionId, input.projectId);
    }),

  replayChunksFrom: procedure
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
        input.sessionId,
        input.projectId,
        input.fromIndex
      );
    }),
});
