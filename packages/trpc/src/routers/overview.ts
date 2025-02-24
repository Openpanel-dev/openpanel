import {
  chQuery,
  formatClickhouseDate,
  formatClickhouseToInterval,
} from '@openpanel/db';
import {
  type IChartRange,
  zChartEventFilter,
  zChartInput,
} from '@openpanel/validation';
import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '../trpc';
import {
  getChartPrevStartEndDate,
  getChartStartEndDate,
} from './chart.helpers';

const zGetStatsInput = zChartInput
  .pick({
    range: true,
    interval: true,
    projectId: true,
    startDate: true,
    endDate: true,
  })
  .extend({
    filters: z.array(zChartEventFilter),
  });
const zGetTopPagesInput = zChartInput
  .pick({
    range: true,
    interval: true,
    projectId: true,
    startDate: true,
    endDate: true,
  })
  .extend({
    filters: z.array(zChartEventFilter),
  });

type IGetStatsInput = z.infer<typeof zGetStatsInput>;
type IGetTopPagesInput = z.infer<typeof zGetTopPagesInput>;

type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};
function getCurrentAndPrevious<
  T extends {
    startDate?: string | null;
    endDate?: string | null;
    range: IChartRange;
  },
  R = unknown,
>(
  cb: (
    input: Prettify<
      Omit<T, 'startDate' | 'endDate'> & { startDate: string; endDate: string }
    >,
  ) => Promise<R>,
) {
  return async (input: T): Promise<{ current: R; previous: R }> => {
    const currentPeriod = getChartStartEndDate(input);
    const previousPeriod = getChartPrevStartEndDate({
      range: input.range,
      ...currentPeriod,
    });
    const [current, previous] = await Promise.all([
      cb({ ...input, ...currentPeriod }),
      cb({ ...input, ...previousPeriod }),
    ]);
    return {
      current,
      previous,
    };
  };
}

const getStats = getCurrentAndPrevious<IGetStatsInput>(async (input) => {
  const sql = `SELECT
  toStartOfDay(created_at) AS date,
  -- Bounce rate (as percentage)
  round(countIf(is_bounce = 1) * 100.0 / count(*), 2) AS bounce_rate,

  -- Unique visitors (based on device_id)
  count(DISTINCT profile_id) AS unique_visitors,

  -- Total sessions
  count(*) AS total_sessions,

  -- Average session duration (in seconds)
  round(avgIf(duration, duration > 0), 2)/1000 AS avg_session_duration,

  -- Total pageviews (sum of screen_view_count)
  sum(screen_view_count) AS total_screen_views,

  -- Views per session
  round(sum(screen_view_count) * 1.0 / count(*), 2) AS views_per_session

FROM sessions
WHERE sign = 1  -- Only count the latest version of each session
  AND created_at BETWEEN ${formatClickhouseToInterval(`'${formatClickhouseDate(input.startDate)}'::DateTime`, input.interval)} AND '${formatClickhouseDate(input.endDate)}'::DateTime
  ${
    input.filters.length
      ? `AND ${input.filters
          .map((filter) => {
            if (filter.name === 'path') {
              return `has(screen_views, '${filter.value}')`;
            }
            return `${filter.name} = '${filter.value}'`;
          })
          .join(' AND ')}`
      : ''
  }
GROUP BY date
ORDER BY date ASC
WITH FILL
FROM ${formatClickhouseToInterval(`'${formatClickhouseDate(input.startDate)}'::DateTime`, input.interval)}
TO '${formatClickhouseDate(input.endDate)}'::DateTime
STEP toIntervalDay(1);`;

  console.log('sql', sql);

  const metrics = await chQuery<{
    bounce_rate: number;
    unique_visitors: number;
    total_sessions: number;
    avg_session_duration: number;
    total_screen_views: number;
    views_per_session: number;
    date: string;
  }>(sql);

  return metrics;
});

const getTopPages = getCurrentAndPrevious<
  IGetTopPagesInput,
  {
    origin: string;
    path: string;
    avg_duration: number;
    bounce_rate: number;
    total_sessions: number;
    total_screen_views: number;
    screen_views: number;
  }[]
>(async (input) => {
  const sql = `
  WITH page_stats AS (
    SELECT
        origin as origin,
        path as path,
        count(*) as count,
        round(avg(duration)/1000, 2) as avg_duration
    FROM events e
    WHERE
        project_id = '${input.projectId}'
        AND name = 'screen_view'
        AND toDate(created_at) >= toDate('${formatClickhouseDate(input.startDate)}')
        AND toDate(created_at) <= toDate('${formatClickhouseDate(input.endDate)}')
    GROUP BY origin, path
  ),
  total_sessions AS (
    SELECT
        count(*) as total_sessions,
        sum(screen_view_count) as total_screen_views
    FROM sessions
    WHERE
        project_id = '${input.projectId}'
        AND toDate(created_at) >= toDate('${formatClickhouseDate(input.startDate)}')
        AND toDate(created_at) <= toDate('${formatClickhouseDate(input.endDate)}')
  ),
  bounce_stats AS (
    SELECT
        entry_path,
        round(
          countIf(is_bounce = 1 AND sign = 1) * 100.0 / 
          countIf(sign = 1), 
          2
        ) as bounce_rate
    FROM sessions
    WHERE
        project_id = '${input.projectId}'
        AND sign = 1
        AND toDate(created_at) >= toDate('${formatClickhouseDate(input.startDate)}')
        AND toDate(created_at) <= toDate('${formatClickhouseDate(input.endDate)}')
        AND entry_path IN (SELECT path FROM page_stats)
    GROUP BY entry_path
  )
  SELECT
    p.origin,
    p.path,
    p.count as screen_views,
    p.avg_duration,
    COALESCE(b.bounce_rate, 0) as bounce_rate,
    ts.total_sessions,
    ts.total_screen_views
  FROM page_stats p
  LEFT JOIN bounce_stats b ON p.path = b.entry_path
  LEFT JOIN total_sessions ts ON 1 = 1
  ORDER BY p.count DESC
  LIMIT 10`;

  console.log('sql', sql);

  const metrics = await chQuery<{
    origin: string;
    path: string;
    avg_duration: number;
    bounce_rate: number;
    total_sessions: number;
    total_screen_views: number;
    screen_views: number;
  }>(sql);

  return metrics;
});

export const overviewRouter = createTRPCRouter({
  stats: publicProcedure.input(zGetStatsInput).query(async ({ ctx, input }) => {
    const { current, previous } = await getStats(input);
    return current;
  }),

  topPages: publicProcedure
    .input(zGetTopPagesInput)
    .query(async ({ input }) => {
      const { current, previous } = await getTopPages(input);
      return current;
    }),
});
