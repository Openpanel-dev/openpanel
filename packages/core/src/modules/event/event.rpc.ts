// Ported from packages/trpc/src/routers/event.ts.
//
// Every procedure is on its V1 twin's builder. `protectedProcedure` runs
// `enforceUserIsAuthed` + `enforceAccess` BEFORE the input parser, exactly as
// V1 does. The explicit checks in the handlers below stay: `enforceAccess` only
// sees a TOP-LEVEL `projectId` / `organizationId`, so anything resolved from
// another id needs its own.
//
// `bots` was V1's only `publicProcedure` here (anonymous callers were let in
// when a share-overview row existed); ADR-011 makes it protected.
//
// `pages` / `pagesTimeseries` / `previousPages` / `pageTimeseries` read the
// overview module's pages service; since M10-005 that is `ctx.services.pages`,
// so the three-way lazy `import('@openpanel/core')` hop this file used to make
// for it is gone.

import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../../rpc/base';
import { TRPCNotFoundError } from '../../rpc/errors';
import { getSettingsForProject } from '../organization/organization.service';
import {
  zChartEventFilter,
  zRange,
  zTimeInterval,
} from '../report/report.constants';
import { getChartStartEndDate } from '../report/src/chart-dates';
import {
  getBotEventsPage,
  getConversionEventNames,
  getConversionListPage,
  getEventById,
  getEventDetails,
  getEventListPage,
  getTopOrigins,
  updateEventMeta,
} from './event.service';

const DEFAULT_BOTS_LIMIT = 8;

/**
 * `pagesTimeseries` returns every page in the project, so its size is the
 * project's page cardinality, not its traffic: unbounded it is 5,050,763 rows /
 * 486 MiB on the busiest anchor. 50 is enough to carry any chart legend or
 * table page the result could feed, and caps the response at `50 x buckets`.
 * The origin+path-filtered `pageTimeseries` below is bounded by its own filters
 * and stays unbounded here.
 */
const PAGES_TIMESERIES_TOP_PAGES_PER_BUCKET = 50;

const zEventRef = z.object({
  id: z.string(),
  projectId: z.string(),
  createdAt: z.date().optional(),
});

const zChartWindow = z.object({
  projectId: z.string(),
  range: zRange,
  interval: zTimeInterval,
});

function formatClickhouseDateTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
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
    .mutation(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'write',
      });

      return updateEventMeta(ctx, input);
    }),

  byId: protectedProcedure.input(zEventRef).query(async ({ input, ctx }) => {
    await ctx.services.auth.requireProjectAccess({
      userId: ctx.session.userId,
      projectId: input.projectId,
      level: 'read',
    });

    const event = await getEventById(ctx, input);
    if (!event) {
      throw new TRPCNotFoundError('Event not found');
    }
    return event;
  }),

  details: protectedProcedure.input(zEventRef).query(async ({ input, ctx }) => {
    await ctx.services.auth.requireProjectAccess({
      userId: ctx.session.userId,
      projectId: input.projectId,
      level: 'read',
    });

    const details = await getEventDetails(ctx, () => ctx.services, input);
    if (!details) {
      throw new TRPCNotFoundError('Event not found');
    }
    return details;
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
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });

      return getEventListPage(ctx, input);
    }),

  conversionNames: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });

      return getConversionEventNames(ctx, input.projectId);
    }),

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
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });

      return getConversionListPage(ctx, input);
    }),

  bots: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        cursor: z.number().optional(),
        limit: z.number().default(DEFAULT_BOTS_LIMIT),
      })
    )
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });

      return getBotEventsPage(ctx, input);
    }),

  pages: protectedProcedure
    .input(
      zChartWindow.extend({
        cursor: z.number().optional(),
        take: z.number().min(1).optional(),
        search: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });

      const { timezone } = await getSettingsForProject(ctx, input.projectId);
      const { startDate, endDate } = getChartStartEndDate(input, timezone);
      return ctx.services.pages.getTopPages({
        projectId: input.projectId,
        startDate,
        endDate,
        timezone,
        search: input.search,
        limit: input.take,
      });
    }),

  pagesTimeseries: protectedProcedure
    .input(zChartWindow)
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });

      const { timezone } = await getSettingsForProject(ctx, input.projectId);
      const { startDate, endDate } = getChartStartEndDate(input, timezone);
      return ctx.services.pages.getPageTimeseries({
        projectId: input.projectId,
        startDate,
        endDate,
        timezone,
        interval: input.interval,
        topPagesPerBucket: PAGES_TIMESERIES_TOP_PAGES_PER_BUCKET,
      });
    }),

  previousPages: protectedProcedure
    .input(zChartWindow)
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });

      const { timezone } = await getSettingsForProject(ctx, input.projectId);
      const { startDate, endDate } = getChartStartEndDate(input, timezone);

      const startMs = new Date(startDate).getTime();
      const endMs = new Date(endDate).getTime();
      const duration = endMs - startMs;
      const previousEnd = new Date(startMs - 1);
      const previousStart = new Date(previousEnd.getTime() - duration);

      return ctx.services.pages.getTopPages({
        projectId: input.projectId,
        startDate: formatClickhouseDateTime(previousStart),
        endDate: formatClickhouseDateTime(previousEnd),
        timezone,
      });
    }),

  pageTimeseries: protectedProcedure
    .input(zChartWindow.extend({ origin: z.string(), path: z.string() }))
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });

      const { timezone } = await getSettingsForProject(ctx, input.projectId);
      const { startDate, endDate } = getChartStartEndDate(input, timezone);
      return ctx.services.pages.getPageTimeseries({
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
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });

      return getTopOrigins(ctx, input.projectId);
    }),
});
