// `overviewProcedure` is V1's own builder — `publicProcedure` plus one
// middleware that resolves share-or-membership off the raw
// `projectId`/`shareId`, BEFORE the input parser. `runFilterCommand` is a
// `protectedProcedure`, as in V1.
//
// V1's per-range `cacheMiddleware` did NOT move with M11-001;
// `createCacheMiddleware` in rpc/base.ts is the seam that will carry it.
//
// `liveData`'s ClickHouse queries used to live inline in packages/trpc's
// router; they moved to `services.overview.getLiveData` (src/overview.sql.ts)
// so every query this module runs goes through the same `sql` tag.

import { getChartPrevStartEndDate } from '@openpanel/shared';
import { format } from 'date-fns';
import { z } from 'zod';
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
  type TrpcContext,
} from '../../rpc/base';
import { TRPCForbiddenError } from '../../rpc/errors';
import type { ServiceDeps } from '../../services';
import { pageContextSchema } from '../assistant/assistant.constants';
import { getConversionEventNames } from '../event/event.service';
import { getReferrerSpikes } from '../insight/insight.service';
import {
  getOrganizationSubscriptionChartEndDate,
  getSettingsForProject,
} from '../organization/organization.service';
import { type IChartRange, zRange } from '../report/report.constants';
import { getChartStartEndDate } from '../report/src/chart-dates';
import {
  zGetMapDataInput,
  zGetMetricsInput,
  zGetTopEventsInput,
  zGetTopGenericInput,
  zGetTopGenericSeriesInput,
  zGetTopLinkOutInput,
  zGetTopPagesInput,
  zGetUserJourneyInput,
} from './overview.service';

/**
 * Share-aware access: with `shareId`, a public (optionally password-unlocked)
 * overview share is enough; without it, the caller must be a project member.
 * A password-protected share without the unlock cookie comes back as
 * `{ isValid: false }` rather than throwing, so the result must be checked —
 * ignoring it leaves the data open to anyone holding the link.
 */
async function resolveOverviewAccess(
  ctx: TrpcContext,
  input: { projectId: string; shareId?: string }
): Promise<void> {
  if (input.shareId) {
    const shareValidation =
      await ctx.services.share.validateOverviewShareAccess(
        input.shareId,
        input.projectId,
        {
          cookies: ctx.cookies,
          session: ctx.session.userId
            ? { userId: ctx.session.userId }
            : undefined,
        }
      );
    if (!shareValidation.isValid) {
      throw new TRPCForbiddenError('You do not have access to this share');
    }
    return;
  }
  await ctx.services.auth.requireProjectAccess({
    userId: ctx.services.auth.requireLogin(ctx.session.userId),
    projectId: input.projectId,
    level: 'read',
  });
}

const overviewProcedure = publicProcedure.use(
  async ({ ctx, next, getRawInput }) => {
    const rawInput = (await getRawInput()) as {
      projectId: string;
      shareId?: string;
    };
    await resolveOverviewAccess(ctx, rawInput);
    return next();
  }
);

function getCurrentAndPrevious<
  T extends {
    startDate?: string | null;
    endDate?: string | null;
    range: IChartRange;
    projectId: string;
  },
>(input: T, fetchPrevious: boolean, timezone: string, ctx: ServiceDeps) {
  const current = getChartStartEndDate(input, timezone);
  const previous = getChartPrevStartEndDate(current);

  return async <R>(
    fn: (input: T & { startDate: string; endDate: string }) => Promise<R>
  ): Promise<{
    current: R;
    previous: R | null;
  }> => {
    const endDate = await getOrganizationSubscriptionChartEndDate(
      ctx,
      input.projectId,
      current.endDate
    );
    if (endDate) {
      current.endDate = endDate;
      // Only expired trial scenarios
      if (new Date(current.startDate) > new Date(current.endDate)) {
        current.startDate = current.endDate;
      }
    }
    const res = await Promise.all([
      fn({
        ...input,
        startDate: current.startDate,
        endDate: current.endDate,
      }),
      fetchPrevious
        ? fn({
            ...input,
            startDate: previous.startDate,
            endDate: previous.endDate,
          })
        : Promise.resolve(null),
    ]);

    return {
      current: res[0],
      previous: res[1],
    };
  };
}

export const overviewRouter = createTRPCRouter({
  liveVisitors: overviewProcedure
    .input(z.object({ projectId: z.string(), shareId: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      return ctx.services.realtime.getActiveVisitorCount(input.projectId);
    }),

  liveData: overviewProcedure
    .input(z.object({ projectId: z.string(), shareId: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      return ctx.services.overview.getLiveData(input.projectId);
    }),

  stats: overviewProcedure
    .input(
      zGetMetricsInput.omit({ startDate: true, endDate: true }).extend({
        startDate: z.string().nullish(),
        endDate: z.string().nullish(),
        range: zRange,
        shareId: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { timezone } = await getSettingsForProject(ctx, input.projectId);
      const { current, previous } = await getCurrentAndPrevious(
        { ...input, timezone },
        true,
        timezone,
        ctx
      )(ctx.services.overview.getMetrics);
      return {
        metrics: {
          ...current.metrics,
          prev_bounce_rate: previous?.metrics.bounce_rate || null,
          prev_unique_visitors: previous?.metrics.unique_visitors || null,
          prev_total_screen_views: previous?.metrics.total_screen_views || null,
          prev_avg_session_duration:
            previous?.metrics.avg_session_duration || null,
          prev_views_per_session: previous?.metrics.views_per_session || null,
          prev_total_sessions: previous?.metrics.total_sessions || null,
          prev_total_revenue: previous?.metrics.total_revenue || null,
        },
        series: current.series.map((item, index) => {
          const prev = previous?.series[index];
          return {
            ...item,
            date: format(item.date, 'yyyy-MM-dd HH:mm:ss'),
            prev_bounce_rate: prev?.bounce_rate,
            prev_unique_visitors: prev?.unique_visitors,
            prev_total_screen_views: prev?.total_screen_views,
            prev_avg_session_duration: prev?.avg_session_duration,
            prev_views_per_session: prev?.views_per_session,
            prev_total_sessions: prev?.total_sessions,
            prev_total_revenue: prev?.total_revenue,
          };
        }),
      };
    }),

  getReferrerSpikes: overviewProcedure
    .input(
      zGetMetricsInput.omit({ startDate: true, endDate: true }).extend({
        startDate: z.string().nullish(),
        endDate: z.string().nullish(),
        range: zRange,
        shareId: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { timezone } = await getSettingsForProject(ctx, input.projectId);
      const { startDate, endDate } = getChartStartEndDate(input, timezone);
      const clusters = await getReferrerSpikes(ctx, {
        projectId: input.projectId,
        filters: input.filters,
        interval: input.interval,
        startDate,
        endDate,
        timezone,
      });
      // Reformat every spike date (and the cluster's anchor) to match
      // overview.stats' series date format, so markers x-align with the
      // chart's data points (xScale matches by Date identity).
      const fmt = (iso: string) => format(new Date(iso), 'yyyy-MM-dd HH:mm:ss');
      return clusters.map((cluster) => ({
        anchorDate: fmt(cluster.anchorDate),
        spikes: cluster.spikes.map((spike) => ({
          ...spike,
          date: fmt(spike.date),
        })),
      }));
    }),

  topPages: overviewProcedure
    .input(
      zGetTopPagesInput.omit({ startDate: true, endDate: true }).extend({
        startDate: z.string().nullish(),
        endDate: z.string().nullish(),
        range: zRange,
        mode: z.enum(['page', 'entry', 'exit', 'bot']),
        shareId: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { timezone } = await getSettingsForProject(ctx, input.projectId);
      const { current } = await getCurrentAndPrevious(
        { ...input },
        false,
        timezone,
        ctx
      )(async (input) => {
        if (input.mode === 'page') {
          return ctx.services.overview.getTopPages({ ...input, timezone });
        }

        if (input.mode === 'bot') {
          return Promise.resolve([]);
        }

        return ctx.services.overview.getTopEntryExit({
          ...input,
          mode: input.mode,
          timezone,
        });
      });

      return current;
    }),

  topGeneric: overviewProcedure
    .input(
      zGetTopGenericInput.omit({ startDate: true, endDate: true }).extend({
        startDate: z.string().nullish(),
        endDate: z.string().nullish(),
        range: zRange,
        shareId: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { timezone } = await getSettingsForProject(ctx, input.projectId);
      const { current } = await getCurrentAndPrevious(
        { ...input, timezone },
        false,
        timezone,
        ctx
      )(ctx.services.overview.getTopGeneric);

      return current;
    }),

  topGenericSeries: overviewProcedure
    .input(
      zGetTopGenericSeriesInput
        .omit({ startDate: true, endDate: true })
        .extend({
          startDate: z.string().nullish(),
          endDate: z.string().nullish(),
          range: zRange,
          shareId: z.string().optional(),
        })
    )
    .query(async ({ input, ctx }) => {
      const { timezone } = await getSettingsForProject(ctx, input.projectId);
      const { current } = await getCurrentAndPrevious(
        { ...input, timezone },
        false,
        timezone,
        ctx
      )(ctx.services.overview.getTopGenericSeries);

      return current;
    }),

  userJourney: overviewProcedure
    .input(
      zGetUserJourneyInput.omit({ startDate: true, endDate: true }).extend({
        startDate: z.string().nullish(),
        endDate: z.string().nullish(),
        range: zRange,
        steps: z.number().min(2).max(10).default(5).optional(),
        shareId: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { timezone } = await getSettingsForProject(ctx, input.projectId);
      const { current } = await getCurrentAndPrevious(
        { ...input, timezone },
        false,
        timezone,
        ctx
      )(async (input) => {
        return ctx.services.overview.getUserJourney({
          ...input,
          steps: input.steps ?? 5,
          timezone,
        });
      });

      return current;
    }),

  topEvents: overviewProcedure
    .input(
      zGetTopEventsInput.omit({ startDate: true, endDate: true }).extend({
        startDate: z.string().nullish(),
        endDate: z.string().nullish(),
        range: zRange,
        shareId: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { timezone } = await getSettingsForProject(ctx, input.projectId);
      const { current } = await getCurrentAndPrevious(
        { ...input, timezone },
        false,
        timezone,
        ctx
      )(ctx.services.overview.getTopEvents);

      return current;
    }),

  topConversions: overviewProcedure
    .input(
      z.object({
        projectId: z.string(),
        shareId: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      return getConversionEventNames(ctx, input.projectId);
    }),

  topLinkOut: overviewProcedure
    .input(
      zGetTopLinkOutInput.omit({ startDate: true, endDate: true }).extend({
        startDate: z.string().nullish(),
        endDate: z.string().nullish(),
        range: zRange,
        shareId: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { timezone } = await getSettingsForProject(ctx, input.projectId);
      const { current } = await getCurrentAndPrevious(
        { ...input, timezone },
        false,
        timezone,
        ctx
      )(ctx.services.overview.getTopLinkOut);

      return current;
    }),

  // One-shot AI command bar — converts natural-language requests
  // ("show 7 aug to 11 aug", "from google", "mobile only for august
  // last year") into structured filter changes the dashboard can apply
  // through the same handlers the chat panel uses.
  runFilterCommand: protectedProcedure
    // Computes filter changes for the caller's own UI; changes no project state.
    .meta({ readOnlyMutation: true })
    .input(
      z.object({
        projectId: z.string(),
        query: z.string().min(1).max(500),
        pageContext: pageContextSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });
      const { timezone } = await getSettingsForProject(ctx, input.projectId);
      return ctx.services.assistant.runFilterCommand({
        query: input.query,
        projectId: input.projectId,
        pageContext: input.pageContext,
        timezone: timezone || 'UTC',
      });
    }),

  map: overviewProcedure
    .input(
      zGetMapDataInput.omit({ startDate: true, endDate: true }).extend({
        startDate: z.string().nullish(),
        endDate: z.string().nullish(),
        range: zRange,
        shareId: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { timezone } = await getSettingsForProject(ctx, input.projectId);
      const { current } = await getCurrentAndPrevious(
        { ...input, timezone },
        false,
        timezone,
        ctx
      )(ctx.services.overview.getMapData);

      return current;
    }),
});
