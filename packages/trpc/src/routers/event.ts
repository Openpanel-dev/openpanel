// Dissolved into @openpanel/core's event module (M7-002): the ClickHouse
// queries moved to packages/core/src/modules/event/event.service.ts and
// src/event.sql.ts. This router stays (DELEGATE PATTERN) — it keeps V1's
// protectedProcedure stack and delegates every handler body to core's event
// functions, same as session.ts.
//
// `bots` was a `publicProcedure` that let anonymous callers in on the mere
// existence of a ShareOverview row; ADR-011 (§9, P6 row) makes it
// `protectedProcedure`. The pages* procedures still read `pagesService`,
// which the overview module owns (its own task).

import {
  getBotEventsPage,
  getChartStartEndDate,
  getConversionEventNames,
  getConversionListPage,
  getEventById,
  getEventDetails,
  getEventListPage,
  getSettingsForProject,
  getTopOrigins,
  pagesService,
  updateEventMeta,
} from '@openpanel/core';
import {
  zChartEventFilter,
  zRange,
  zTimeInterval,
} from '@openpanel/validation';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../trpc';

const zEventRef = z.object({
  id: z.string(),
  projectId: z.string(),
  createdAt: z.date().optional(),
});

function eventNotFound() {
  return new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
}

export const eventRouter = createTRPCRouter({
  updateEventMeta: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string(),
        icon: z.string().optional(),
        color: z.string().optional(),
        conversion: z.boolean().optional(),
      })
    )
    .mutation(({ input }) => updateEventMeta(input)),

  byId: protectedProcedure.input(zEventRef).query(async ({ input }) => {
    const res = await getEventById(input);
    if (!res) {
      throw eventNotFound();
    }
    return res;
  }),

  details: protectedProcedure.input(zEventRef).query(async ({ input }) => {
    const res = await getEventDetails(input);
    if (!res) {
      throw eventNotFound();
    }
    return res;
  }),

  events: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        profileId: z.string().nullish(),
        sessionId: z.string().nullish(),
        groupId: z.string().nullish(),
        cohortId: z.string().nullish(),
        cursor: z.string().nullish(),
        filters: z.array(zChartEventFilter).default([]),
        startDate: z.date().nullish(),
        endDate: z.date().nullish(),
        events: z.array(z.string()).nullish(),
        columnVisibility: z.record(z.string(), z.boolean()).nullish(),
      })
    )
    .query(({ input }) => getEventListPage(input)),

  conversionNames: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input: { projectId } }) => getConversionEventNames(projectId)),

  conversions: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        cursor: z.string().nullish(),
        startDate: z.date().nullish(),
        endDate: z.date().nullish(),
        events: z.array(z.string()).nullish(),
        columnVisibility: z.record(z.string(), z.boolean()).nullish(),
      })
    )
    .query(({ input }) => getConversionListPage(input)),

  bots: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        cursor: z.number().optional(),
        limit: z.number().default(8),
      })
    )
    .query(({ input }) => getBotEventsPage(input)),

  pages: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        cursor: z.number().optional(),
        take: z.number().min(1).optional(),
        search: z.string().optional(),
        range: zRange,
        interval: zTimeInterval,
      })
    )
    .query(async ({ input }) => {
      const { timezone } = await getSettingsForProject(input.projectId);
      const { startDate, endDate } = getChartStartEndDate(input, timezone);
      return pagesService.getTopPages({
        projectId: input.projectId,
        startDate,
        endDate,
        timezone,
        search: input.search,
        limit: input.take,
      });
    }),

  pagesTimeseries: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        range: zRange,
        interval: zTimeInterval,
      })
    )
    .query(async ({ input }) => {
      const { timezone } = await getSettingsForProject(input.projectId);
      const { startDate, endDate } = getChartStartEndDate(input, timezone);
      return pagesService.getPageTimeseries({
        projectId: input.projectId,
        startDate,
        endDate,
        timezone,
        interval: input.interval,
      });
    }),

  previousPages: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        range: zRange,
        interval: zTimeInterval,
      })
    )
    .query(async ({ input }) => {
      const { timezone } = await getSettingsForProject(input.projectId);
      const { startDate, endDate } = getChartStartEndDate(input, timezone);

      const startMs = new Date(startDate).getTime();
      const endMs = new Date(endDate).getTime();
      const duration = endMs - startMs;

      const prevEnd = new Date(startMs - 1);
      const prevStart = new Date(prevEnd.getTime() - duration);
      const fmt = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');

      return pagesService.getTopPages({
        projectId: input.projectId,
        startDate: fmt(prevStart),
        endDate: fmt(prevEnd),
        timezone,
      });
    }),

  pageTimeseries: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        range: zRange,
        interval: zTimeInterval,
        origin: z.string(),
        path: z.string(),
      })
    )
    .query(async ({ input }) => {
      const { timezone } = await getSettingsForProject(input.projectId);
      const { startDate, endDate } = getChartStartEndDate(input, timezone);
      return pagesService.getPageTimeseries({
        projectId: input.projectId,
        startDate,
        endDate,
        timezone,
        interval: input.interval,
        filterOrigin: input.origin,
        filterPath: input.path,
      });
    }),

  origin: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input: { projectId } }) => getTopOrigins(projectId)),
});
