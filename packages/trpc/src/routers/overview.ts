import {
  TABLE_NAMES,
  ch,
  clix,
  eventBuffer,
  getChartPrevStartEndDate,
  getChartStartEndDate,
  getOrganizationSubscriptionChartEndDate,
  getSettingsForProject,
  overviewService,
  zGetMetricsInput,
  zGetTopGenericInput,
  zGetTopGenericSeriesInput,
  zGetTopPagesInput,
  zGetUserJourneyInput,
} from '@openpanel/db';
import { type IChartRange, zRange } from '@openpanel/validation';
import { format } from 'date-fns';
import { z } from 'zod';
import { cacheMiddleware, createTRPCRouter, publicProcedure } from '../trpc';

const cacher = cacheMiddleware((input, opts) => {
  const range = input.range as IChartRange;
  if (opts.path === 'overview.liveData') {
    return 0;
  }

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
>(input: T, fetchPrevious: boolean, timezone: string) {
  const current = getChartStartEndDate(input, timezone);
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
  liveVisitors: publicProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      return eventBuffer.getActiveVisitorCount(input.projectId);
    }),

  liveData: publicProcedure
    .input(z.object({ projectId: z.string() }))
    .use(cacher)
    .query(async ({ input }) => {
      const { timezone } = await getSettingsForProject(input.projectId);

      // Get total unique sessions in the last 30 minutes
      const totalSessionsQuery = clix(ch, timezone)
        .select<{ total_sessions: number }>([
          'uniq(session_id) as total_sessions',
        ])
        .from(TABLE_NAMES.events)
        .where('project_id', '=', input.projectId)
        .where('created_at', '>=', clix.exp('now() - INTERVAL 30 MINUTE'));

      // Get counts per minute for the last 30 minutes
      const minuteCountsQuery = clix(ch, timezone)
        .select<{
          minute: string;
          session_count: number;
          visitor_count: number;
        }>([
          `${clix.toStartOf('created_at', 'minute')} as minute`,
          'uniq(session_id) as session_count',
          'uniq(profile_id) as visitor_count',
        ])
        .from(TABLE_NAMES.events)
        .where('project_id', '=', input.projectId)
        .where('created_at', '>=', clix.exp('now() - INTERVAL 30 MINUTE'))
        .groupBy(['minute'])
        .orderBy('minute', 'ASC')
        .fill(
          clix.exp('toStartOfMinute(now() - INTERVAL 30 MINUTE)'),
          clix.exp('toStartOfMinute(now())'),
          clix.exp('INTERVAL 1 MINUTE'),
        );

      // Get referrers per minute for the last 30 minutes
      const minuteReferrersQuery = clix(ch, timezone)
        .select<{
          minute: string;
          referrer_name: string;
          count: number;
        }>([
          `${clix.toStartOf('created_at', 'minute')} as minute`,
          'referrer_name',
          'uniq(session_id) as count',
        ])
        .from(TABLE_NAMES.events)
        .where('project_id', '=', input.projectId)
        .where('created_at', '>=', clix.exp('now() - INTERVAL 30 MINUTE'))
        .where('referrer_name', '!=', '')
        .where('referrer_name', 'IS NOT NULL')
        .groupBy(['minute', 'referrer_name'])
        .orderBy('minute', 'ASC')
        .orderBy('count', 'DESC');

      // Get unique referrers in the last 30 minutes
      const referrersQuery = clix(ch, timezone)
        .select<{ referrer: string; count: number }>([
          'referrer_name as referrer',
          'uniq(session_id) as count',
        ])
        .from(TABLE_NAMES.events)
        .where('project_id', '=', input.projectId)
        .where('created_at', '>=', clix.exp('now() - INTERVAL 30 MINUTE'))
        .where('referrer_name', '!=', '')
        .where('referrer_name', 'IS NOT NULL')
        .groupBy(['referrer_name'])
        .orderBy('count', 'DESC')
        .limit(10);

      const [totalSessions, minuteCounts, minuteReferrers, referrers] =
        await Promise.all([
          totalSessionsQuery.execute(),
          minuteCountsQuery.execute(),
          minuteReferrersQuery.execute(),
          referrersQuery.execute(),
        ]);

      // Group referrers by minute
      const referrersByMinute = new Map<
        string,
        Array<{ referrer: string; count: number }>
      >();
      minuteReferrers.forEach((item) => {
        if (!referrersByMinute.has(item.minute)) {
          referrersByMinute.set(item.minute, []);
        }
        referrersByMinute.get(item.minute)!.push({
          referrer: item.referrer_name,
          count: item.count,
        });
      });

      return {
        totalSessions: totalSessions[0]?.total_sessions || 0,
        minuteCounts: minuteCounts.map((item) => ({
          minute: item.minute,
          sessionCount: item.session_count,
          visitorCount: item.visitor_count,
          timestamp: new Date(item.minute).getTime(),
          time: new Date(item.minute).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
          referrers: referrersByMinute.get(item.minute) || [],
        })),
        referrers: referrers.map((item) => ({
          referrer: item.referrer,
          count: item.count,
        })),
      };
    }),
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
      const { timezone } = await getSettingsForProject(input.projectId);
      const { current, previous } = await getCurrentAndPrevious(
        { ...input, timezone },
        true,
        timezone,
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
      const { timezone } = await getSettingsForProject(input.projectId);
      const { current } = await getCurrentAndPrevious(
        { ...input },
        false,
        timezone,
      )(async (input) => {
        if (input.mode === 'page') {
          return overviewService.getTopPages({ ...input, timezone });
        }

        if (input.mode === 'bot') {
          return Promise.resolve([]);
        }

        return overviewService.getTopEntryExit({
          ...input,
          mode: input.mode,
          timezone,
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
      const { timezone } = await getSettingsForProject(input.projectId);
      const { current } = await getCurrentAndPrevious(
        { ...input, timezone },
        false,
        timezone,
      )(overviewService.getTopGeneric.bind(overviewService));

      return current;
    }),

  topGenericSeries: publicProcedure
    .input(
      zGetTopGenericSeriesInput.omit({ startDate: true, endDate: true }).extend({
        startDate: z.string().nullish(),
        endDate: z.string().nullish(),
        range: zRange,
      }),
    )
    .use(cacher)
    .query(async ({ input }) => {
      const { timezone } = await getSettingsForProject(input.projectId);
      const { current } = await getCurrentAndPrevious(
        { ...input, timezone },
        false,
        timezone,
      )(overviewService.getTopGenericSeries.bind(overviewService));

      return current;
    }),

  userJourney: publicProcedure
    .input(
      zGetUserJourneyInput.omit({ startDate: true, endDate: true }).extend({
        startDate: z.string().nullish(),
        endDate: z.string().nullish(),
        range: zRange,
        steps: z.number().min(2).max(10).default(5).optional(),
      }),
    )
    .use(cacher)
    .query(async ({ input }) => {
      const { timezone } = await getSettingsForProject(input.projectId);
      const { current } = await getCurrentAndPrevious(
        { ...input, timezone },
        false,
        timezone,
      )(async (input) => {
        return overviewService.getUserJourney({
          ...input,
          steps: input.steps ?? 5,
          timezone,
        });
      });

      return current;
    }),
});
