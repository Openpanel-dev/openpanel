import {
  getOrganizationByProjectIdCached,
  getOrganizationSubscriptionChartEndDate,
  overviewService,
  zGetMetricsInput,
  zGetTopGenericInput,
  zGetTopPagesInput,
} from '@openpanel/db';
import { type IChartRange, zRange } from '@openpanel/validation';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { cacheMiddleware, createTRPCRouter, publicProcedure } from '../trpc';
import {
  getChartPrevStartEndDate,
  getChartStartEndDate,
} from './chart.helpers';

const cacher = cacheMiddleware((input) => {
  const range = input.range as IChartRange;
  switch (range) {
    case '30min':
    case 'today':
    case 'lastHour':
      return 1;
    default:
      return 1;
  }
});

function getCurrentAndPrevious<
  T extends {
    startDate?: string | null;
    endDate?: string | null;
    range: IChartRange;
    projectId: string;
  },
>(input: T, fetchPrevious = false) {
  const current = getChartStartEndDate(input);
  const previous = getChartPrevStartEndDate(current);

  return async <R>(
    fn: (input: T & { startDate: string; endDate: string }) => Promise<R>,
  ): Promise<{
    current: R;
    previous: R | null;
  }> => {
    const endDate = await getOrganizationSubscriptionChartEndDate(
      input.projectId,
      current.endDate,
    );
    if (endDate) {
      current.endDate = endDate;
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
  stats: publicProcedure
    .input(
      zGetMetricsInput.omit({ startDate: true, endDate: true }).extend({
        startDate: z.string().nullish(),
        endDate: z.string().nullish(),
        range: zRange,
      }),
    )
    .use(cacher)
    .query(async ({ ctx, input }) => {
      const { current, previous } = await getCurrentAndPrevious(
        input,
        true,
      )(overviewService.getMetrics.bind(overviewService));

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
        },
        series: current.series.map((item) => {
          const prev = previous?.series.find((p) => p.date === item.date);
          return {
            ...item,
            prev_bounce_rate: prev?.bounce_rate,
            prev_unique_visitors: prev?.unique_visitors,
            prev_total_screen_views: prev?.total_screen_views,
            prev_avg_session_duration: prev?.avg_session_duration,
            prev_views_per_session: prev?.views_per_session,
            prev_total_sessions: prev?.total_sessions,
          };
        }),
      };
    }),

  topPages: publicProcedure
    .input(
      zGetTopPagesInput.omit({ startDate: true, endDate: true }).extend({
        startDate: z.string().nullish(),
        endDate: z.string().nullish(),
        range: zRange,
        mode: z.enum(['page', 'entry', 'exit', 'bot']),
      }),
    )
    .use(cacher)
    .query(async ({ input }) => {
      const { current } = await getCurrentAndPrevious(
        input,
        false,
      )(async (input) => {
        if (input.mode === 'page') {
          return overviewService.getTopPages(input);
        }

        if (input.mode === 'bot') {
          return Promise.resolve([]);
        }

        return overviewService.getTopEntryExit({
          ...input,
          mode: input.mode,
        });
      });

      return current;
    }),

  topGeneric: publicProcedure
    .input(
      zGetTopGenericInput.omit({ startDate: true, endDate: true }).extend({
        startDate: z.string().nullish(),
        endDate: z.string().nullish(),
        range: zRange,
      }),
    )
    .use(cacher)
    .query(async ({ input }) => {
      const { current } = await getCurrentAndPrevious(
        input,
        false,
      )(overviewService.getTopGeneric.bind(overviewService));

      return current;
    }),
});
