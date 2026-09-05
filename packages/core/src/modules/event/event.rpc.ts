// Ported from packages/trpc/src/routers/event.ts (M7-002).
//
// Same arrangement as session.rpc.ts: V1's `protectedProcedure` stack lands
// with auth (P6), so until then each procedure does its own "is anyone logged
// in" + `requireProjectAccess` off the `projectId` input (`read` for queries,
// `write` for `updateEventMeta`). packages/trpc's event router delegates its
// handler bodies onto `./event.service` while keeping V1's own
// `protectedProcedure` stack.
//
// `bots` was V1's only `publicProcedure` here (anonymous callers were let in
// when a share-overview row existed); ADR-011 makes it protected.
//
// `pages` / `pagesTimeseries` / `previousPages` / `pageTimeseries` read from
// `pagesService`, which the overview module owns (its own task) — the bodies
// are ported verbatim and reach it lazily through `@openpanel/db`.

import {
  zChartEventFilter,
  zRange,
  zTimeInterval,
} from '@openpanel/validation';
import { z } from 'zod';
import { createTRPCRouter, procedure } from '../../rpc/base';
import { TRPCAccessError, TRPCNotFoundError } from '../../rpc/errors';
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

function loadAccessChecks() {
  return import('./src/access');
}

function loadPagesRuntime() {
  return Promise.all([
    import('@openpanel/core'),
    import('@openpanel/core'),
    import('@openpanel/core'),
  ]).then(
    ([
      { getSettingsForProject },
      { getChartStartEndDate },
      { pagesService },
    ]) => ({
      getSettingsForProject,
      getChartStartEndDate,
      pagesService,
    })
  );
}

function requireLogin(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCAccessError('Not authenticated');
  }
  return userId;
}

async function requireAccess(
  userId: string,
  projectId: string,
  level: 'read' | 'write'
) {
  const { requireProjectAccess } = await loadAccessChecks();
  await requireProjectAccess({ userId, projectId, level });
}

function formatClickhouseDateTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

export const eventRouter = createTRPCRouter({
  updateEventMeta: procedure
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
      const userId = requireLogin(ctx.session.userId);
      await requireAccess(userId, input.projectId, 'write');

      return updateEventMeta(input);
    }),

  byId: procedure.input(zEventRef).query(async ({ input, ctx }) => {
    const userId = requireLogin(ctx.session.userId);
    await requireAccess(userId, input.projectId, 'read');

    const event = await getEventById(input);
    if (!event) {
      throw new TRPCNotFoundError('Event not found');
    }
    return event;
  }),

  details: procedure.input(zEventRef).query(async ({ input, ctx }) => {
    const userId = requireLogin(ctx.session.userId);
    await requireAccess(userId, input.projectId, 'read');

    const details = await getEventDetails(input);
    if (!details) {
      throw new TRPCNotFoundError('Event not found');
    }
    return details;
  }),

  events: procedure
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
      const userId = requireLogin(ctx.session.userId);
      await requireAccess(userId, input.projectId, 'read');

      return getEventListPage(input);
    }),

  conversionNames: procedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await requireAccess(userId, input.projectId, 'read');

      return getConversionEventNames(input.projectId);
    }),

  conversions: procedure
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
      const userId = requireLogin(ctx.session.userId);
      await requireAccess(userId, input.projectId, 'read');

      return getConversionListPage(input);
    }),

  bots: procedure
    .input(
      z.object({
        projectId: z.string(),
        cursor: z.number().optional(),
        limit: z.number().default(DEFAULT_BOTS_LIMIT),
      })
    )
    .query(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await requireAccess(userId, input.projectId, 'read');

      return getBotEventsPage(input);
    }),

  pages: procedure
    .input(
      zChartWindow.extend({
        cursor: z.number().optional(),
        take: z.number().min(1).optional(),
        search: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await requireAccess(userId, input.projectId, 'read');

      const { getSettingsForProject, getChartStartEndDate, pagesService } =
        await loadPagesRuntime();
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

  pagesTimeseries: procedure
    .input(zChartWindow)
    .query(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await requireAccess(userId, input.projectId, 'read');

      const { getSettingsForProject, getChartStartEndDate, pagesService } =
        await loadPagesRuntime();
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

  previousPages: procedure.input(zChartWindow).query(async ({ input, ctx }) => {
    const userId = requireLogin(ctx.session.userId);
    await requireAccess(userId, input.projectId, 'read');

    const { getSettingsForProject, getChartStartEndDate, pagesService } =
      await loadPagesRuntime();
    const { timezone } = await getSettingsForProject(input.projectId);
    const { startDate, endDate } = getChartStartEndDate(input, timezone);

    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();
    const duration = endMs - startMs;
    const previousEnd = new Date(startMs - 1);
    const previousStart = new Date(previousEnd.getTime() - duration);

    return pagesService.getTopPages({
      projectId: input.projectId,
      startDate: formatClickhouseDateTime(previousStart),
      endDate: formatClickhouseDateTime(previousEnd),
      timezone,
    });
  }),

  pageTimeseries: procedure
    .input(zChartWindow.extend({ origin: z.string(), path: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await requireAccess(userId, input.projectId, 'read');

      const { getSettingsForProject, getChartStartEndDate, pagesService } =
        await loadPagesRuntime();
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

  origin: procedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await requireAccess(userId, input.projectId, 'read');

      return getTopOrigins(input.projectId);
    }),
});
