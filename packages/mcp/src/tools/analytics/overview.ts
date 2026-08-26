import { getAnalyticsOverviewCore } from '@openpanel/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '../../auth';
import {
  projectIdSchema,
  resolveDateRange,
  resolveProjectId,
  table,
  withErrorHandling,
  zDateRange,
} from '../shared';

type Interval = 'hour' | 'day' | 'week' | 'month';

/** Coarsest-to-finest, so we can step down when a request is too fine-grained. */
const INTERVAL_ORDER: Interval[] = ['hour', 'day', 'week', 'month'];

const POINTS_PER_DAY: Record<Interval, number> = {
  hour: 24,
  day: 1,
  week: 1 / 7,
  month: 1 / 30,
};

/**
 * The most points we'll return in one series.
 *
 * A 30-day range at `interval: "hour"` is 720 points of 8 metrics each. That is
 * not a chart an LLM can read — it's a wall of numbers that buries the summary
 * the caller actually asked for.
 */
const MAX_SERIES_POINTS = 180;

const SERIES_COLUMNS = [
  'date',
  'unique_visitors',
  'total_sessions',
  'total_screen_views',
  'bounce_rate',
  'avg_session_duration',
  'views_per_session',
  'total_revenue',
] as const;

/**
 * Pick the finest interval that fits the point budget for this date range.
 *
 * Coarsening beats truncating for a time series: returning the most recent 180
 * of 720 hourly points silently answers a different question than the one asked
 * ("the last week" instead of "the last 30 days"). Stepping the interval down
 * keeps the window intact and only loses resolution, which we say out loud.
 */
function fitInterval(
  requested: Interval,
  startDate: string,
  endDate: string,
): { interval: Interval; note?: string } {
  const days =
    Math.max(
      0,
      (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000,
    ) + 1;
  const points = (i: Interval) => Math.ceil(days * POINTS_PER_DAY[i]);

  if (points(requested) <= MAX_SERIES_POINTS) {
    return { interval: requested };
  }

  const start = INTERVAL_ORDER.indexOf(requested);
  for (const candidate of INTERVAL_ORDER.slice(start + 1)) {
    if (points(candidate) <= MAX_SERIES_POINTS) {
      return {
        interval: candidate,
        note: `Requested interval "${requested}" would return ~${points(requested)} points over this range, above the ${MAX_SERIES_POINTS}-point limit. Coarsened to "${candidate}" (~${points(candidate)} points) — the date range is unchanged. Narrow the range to get "${requested}" resolution.`,
      };
    }
  }

  const coarsest = INTERVAL_ORDER[INTERVAL_ORDER.length - 1] as Interval;
  return {
    interval: coarsest,
    note: `Requested interval "${requested}" is far too fine for this range; coarsened to "${coarsest}". Narrow the date range for finer resolution.`,
  };
}

export function registerOverviewTools(
  server: McpServer,
  context: McpAuthContext,
) {
  server.tool(
    'get_analytics_overview',
    'Get key analytics metrics for a date range: unique visitors, total pageviews, sessions, bounce rate, average session duration, and views per session. Includes a time-series breakdown by interval — the interval is automatically coarsened if the requested one would produce an unreadably long series, and the response says so when that happens.',
    {
      projectId: projectIdSchema(context),
      ...zDateRange,
      interval: z
        .enum(['hour', 'day', 'week', 'month'])
        .default('day')
        .optional()
        .describe('Time interval for the series breakdown (default: day)'),
      includeSeries: z
        .boolean()
        .default(true)
        .optional()
        .describe(
          'Set false to get only the summary totals and skip the per-interval series. Do this when you just need the headline numbers.',
        ),
    },
    async ({ projectId: inputProjectId, startDate: sd, endDate: ed, interval, includeSeries }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        const { startDate, endDate } = resolveDateRange(sd, ed);
        const fitted = fitInterval(interval ?? 'day', startDate, endDate);

        const result = await getAnalyticsOverviewCore({
          projectId,
          startDate,
          endDate,
          interval: fitted.interval,
        });

        if (includeSeries === false) {
          return {
            summary: result.summary,
            startDate,
            endDate,
          };
        }

        return {
          summary: result.summary,
          interval: fitted.interval,
          startDate,
          endDate,
          ...(fitted.note ? { interval_note: fitted.note } : {}),
          series: table(result.series, {
            limit: MAX_SERIES_POINTS,
            columns: SERIES_COLUMNS,
            sortedBy: 'date',
            unit: 'intervals',
          }),
        };
      }),
  );
}
