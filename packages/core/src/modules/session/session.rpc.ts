// `protectedProcedure` runs `enforceUserIsAuthed` + `enforceAccess` BEFORE the
// input parser. The explicit checks in the handlers below stay: `enforceAccess`
// only sees a TOP-LEVEL `projectId` / `organizationId`, so anything resolved
// from another id needs its own.

import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../../rpc/base';
import { zChartEventFilter } from '../report/report.constants';
import {
  getSessionById,
  getSessionList,
  getSessionReplayChunksFrom,
} from './session.service';

const DEFAULT_LIST_TAKE = 50;
/** A list page, not an export. `/export/events` is the bulk path. */
const MAX_LIST_TAKE = 1000;

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
        take: z
          .number()
          .int()
          .min(1)
          .max(MAX_LIST_TAKE)
          .default(DEFAULT_LIST_TAKE),
      })
    )
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });

      return getSessionList(ctx, {
        ...input,
        cursor: input.cursor ? new Date(input.cursor) : undefined,
      });
    }),

  byId: protectedProcedure
    .input(z.object({ sessionId: z.string(), projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });

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
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });

      return getSessionReplayChunksFrom(
        ctx,
        input.sessionId,
        input.projectId,
        input.fromIndex
      );
    }),
});
