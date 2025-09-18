import { z } from 'zod';

import {
  getSessionList,
  getSessionsCountCached,
  sessionService,
} from '@openpanel/db';
import { zChartEventFilter } from '@openpanel/validation';

import { createTRPCRouter, protectedProcedure } from '../trpc';

export const sessionRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        profileId: z.string().optional(),
        cursor: z.number().optional(),
        filters: z.array(zChartEventFilter).default([]),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        search: z.string().optional(),
        take: z.number().default(50),
      }),
    )
    .query(async ({ input }) => {
      const [data, totalCount] = await Promise.all([
        getSessionList({
          ...input,
          cursor: input.cursor,
        }),
        getSessionsCountCached({
          projectId: input.projectId,
          profileId: input.profileId,
          filters: input.filters,
          startDate: input.startDate,
          endDate: input.endDate,
          search: input.search,
        }),
      ]);

      return {
        data,
        meta: {
          count: totalCount,
          pageCount: input.take,
        },
      };
    }),

  byId: protectedProcedure
    .input(z.object({ sessionId: z.string(), projectId: z.string() }))
    .query(async ({ input: { sessionId, projectId } }) => {
      return sessionService.byId(sessionId, projectId);
    }),
});
