// Dissolved into @openpanel/core's session module (M7-001): the ClickHouse
// queries moved to packages/core/src/modules/session/session.service.ts.
// This router stays (DELEGATE PATTERN) — it keeps V1's protectedProcedure
// stack and delegates every handler body to core's session functions, same
// as realtime.ts/notification.ts. V1's unused `encodeCursor`/`decodeCursor`
// went with it (packages/core/src/shared/pagination.ts owns the generic pair).

import {
  getSessionById,
  getSessionDistinctValues,
  getSessionList,
  getSessionReplayChunksFrom,
  SESSION_DISTINCT_FIELDS,
} from '@openpanel/core';
import { zChartEventFilter } from '@openpanel/validation';
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../trpc';

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
        take: z.number().default(50),
      })
    )
    .query(({ input }) => {
      return getSessionList({
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
    .query(({ input }) => {
      return getSessionDistinctValues(input.projectId, input.field);
    }),

  byId: protectedProcedure
    .input(z.object({ sessionId: z.string(), projectId: z.string() }))
    .query(({ input: { sessionId, projectId } }) => {
      return getSessionById(sessionId, projectId);
    }),

  replayChunksFrom: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        projectId: z.string(),
        fromIndex: z.number().int().min(0).default(0),
      })
    )
    .query(({ input: { sessionId, projectId, fromIndex } }) => {
      return getSessionReplayChunksFrom(sessionId, projectId, fromIndex);
    }),
});
