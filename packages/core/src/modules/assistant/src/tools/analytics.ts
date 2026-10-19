import { tool } from 'ai';
import { z } from 'zod';
import { getFunnelCore } from '../../../chart/funnel.service';
import {
  getRetentionCohortCore,
  getRollingActiveUsersCore,
} from '../../../chart/retention.service';
import { getUserFlowCore } from '../../../chart/sankey.service';
import { queryEventsCore } from '../../../event/event.service';
import {
  getAnalyticsOverviewCore,
  getTrafficBreakdownCore,
  type TrafficColumn,
} from '../../../overview/overview.service';
import { getTopPagesCore } from '../../../overview/pages.service';
import type { IReportInput } from '../../../report/report.constants';
import { querySessionsCore } from '../../../session/session.service';
import type { ChatToolContext } from '../context';
import {
  type ChartToolOutput,
  chartModelSummary,
  chartToModelOutput,
  runReportConfig,
  summarizeChartData,
} from './charts';
import { resolveRange, revenueToUnits, truncateRows } from './shared';

const TRAFFIC_COLUMNS = [
  'referrer_name',
  'referrer_type',
  'referrer',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'country',
  'region',
  'city',
  'device',
  'browser',
  'os',
] as const satisfies readonly TrafficColumn[];

const DEFAULT_BREAKDOWN_LIMIT = 25;
const MAX_BREAKDOWN_LIMIT = 200;
const DEFAULT_QUERY_LIMIT = 20;
const MAX_QUERY_LIMIT = 100;
const DEFAULT_ACTIVE_USER_DAYS = 30;
const MAX_ACTIVE_USER_DAYS = 365;
const DEFAULT_FUNNEL_WINDOW_HOURS = 24;
const MAX_FUNNEL_WINDOW_HOURS = 720;
const MAX_FUNNEL_STEPS = 10;
const MS_PER_DAY = 86_400_000;
const DATE_LENGTH = 10;
const RETENTION_WEEKS = 12;
const DAYS_PER_WEEK = 7;

const zOptionalRange = {
  startDate: z
    .string()
    .optional()
    .describe('YYYY-MM-DD, defaults to the current view.'),
  endDate: z
    .string()
    .optional()
    .describe('YYYY-MM-DD, defaults to the current view.'),
};

function daysAgo(days: number): string {
  return new Date(Date.now() - days * MS_PER_DAY)
    .toISOString()
    .slice(0, DATE_LENGTH);
}

type Segment = NonNullable<
  IReportInput['series'][number] extends infer S
    ? S extends { type: 'event'; segment?: infer Seg }
      ? Seg
      : never
    : never
>;

const HOURLY_MAX_DAYS = 2;
const DAILY_MAX_DAYS = 90;
const WEEKLY_MAX_DAYS = 366;

/** The interval the dashboard itself would pick for a window. */
function autoInterval(
  startDate: string,
  endDate: string
): 'hour' | 'day' | 'week' | 'month' {
  const days =
    (new Date(endDate).getTime() - new Date(startDate).getTime()) / MS_PER_DAY;
  if (days <= HOURLY_MAX_DAYS) {
    return 'hour';
  }
  if (days <= DAILY_MAX_DAYS) {
    return 'day';
  }
  if (days <= WEEKLY_MAX_DAYS) {
    return 'week';
  }
  return 'month';
}

/** Series ids are letters so two series on the same event stay distinct. */
const SERIES_IDS = 'ABCDEFGHIJ'.split('');

function eventSeries(
  id: string,
  name: string,
  segment: Segment,
  displayName = name
) {
  return {
    id,
    type: 'event' as const,
    name,
    displayName,
    segment,
    filters: [],
  };
}

export function analyticsTools(ctx: ChatToolContext) {
  const { deps, projectId } = ctx;

  return {
    get_overview: tool({
      description:
        'Headline metrics for a period with the previous period for comparison: unique visitors, sessions, pageviews, bounce rate, session duration. Renders a visitors-and-sessions chart with the previous period overlaid. Start here for "how are we doing" questions; one call covers both periods.',
      inputSchema: z.object({
        ...zOptionalRange,
        interval: z
          .enum(['hour', 'day', 'week', 'month'])
          .optional()
          .describe('Defaults to what fits the range.'),
      }),
      execute: async ({ startDate, endDate, interval }) => {
        const range = resolveRange(ctx, { startDate, endDate });
        const bucket = interval ?? autoInterval(range.startDate, range.endDate);
        const overview = await getAnalyticsOverviewCore(deps, {
          projectId,
          startDate: range.startDate,
          endDate: range.endDate,
          interval: bucket,
          filters: [],
        });
        const report: IReportInput & { name: string } = {
          projectId,
          name: 'Visitors and sessions',
          chartType: 'linear',
          interval: bucket,
          range: 'custom',
          startDate: range.startDate,
          endDate: range.endDate,
          metric: 'sum',
          previous: true,
          breakdowns: [],
          lineType: 'monotone',
          series: [
            eventSeries('A', 'screen_view', 'user', 'Unique visitors'),
            eventSeries('B', 'screen_view', 'session', 'Sessions'),
          ],
        };
        const output: ChartToolOutput = {
          title: report.name,
          report,
          summary: overview.summary as unknown as Record<string, unknown>,
        };
        return output;
      },
      toModelOutput: ({ output }) => chartToModelOutput(output),
    }),

    get_breakdown: tool({
      description:
        'Top values of one dimension for a period: pages (`path`), referrers, UTM parameters, geography or device. Renders a bar chart; you get sessions, pageviews and revenue per value.',
      inputSchema: z.object({
        dimension: z.enum(['path', ...TRAFFIC_COLUMNS]),
        ...zOptionalRange,
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_BREAKDOWN_LIMIT)
          .default(DEFAULT_BREAKDOWN_LIMIT),
      }),
      execute: async ({ dimension, startDate, endDate, limit }) => {
        const range = resolveRange(ctx, { startDate, endDate });
        const rows =
          dimension === 'path'
            ? await getTopPagesCore(deps, {
                projectId,
                startDate: range.startDate,
                endDate: range.endDate,
                limit,
              })
            : await getTrafficBreakdownCore(deps, {
                projectId,
                startDate: range.startDate,
                endDate: range.endDate,
                column: dimension,
              });
        const label =
          dimension === 'path' ? 'pages' : dimension.replace(/_/g, ' ');
        const report: IReportInput & { name: string } = {
          projectId,
          name: `Top ${label}`,
          chartType: 'bar',
          interval: autoInterval(range.startDate, range.endDate),
          range: 'custom',
          startDate: range.startDate,
          endDate: range.endDate,
          metric: 'sum',
          previous: false,
          limit,
          breakdowns: [{ id: '1', name: dimension }],
          series: [
            dimension === 'path'
              ? eventSeries('A', 'screen_view', 'event', 'Pageviews')
              : eventSeries('A', 'screen_view', 'session', 'Sessions'),
          ],
        };
        const output: ChartToolOutput = {
          title: report.name,
          report,
          summary: {
            dimension,
            ...truncateRows(
              revenueToUnits(rows as { revenue?: number }[]),
              limit
            ),
          },
        };
        return output;
      },
      toModelOutput: ({ output }) => chartToModelOutput(output),
    }),

    query_events: tool({
      description:
        'Raw events matching filters, newest first. For "show me the last X events", "did we get any Y events", or inspecting the properties of real events. Aggregates belong in create_chart.',
      inputSchema: z.object({
        ...zOptionalRange,
        eventNames: z.array(z.string()).optional(),
        path: z.string().optional(),
        country: z.string().optional(),
        city: z.string().optional(),
        device: z.string().optional(),
        browser: z.string().optional(),
        os: z.string().optional(),
        referrer: z.string().optional(),
        referrerName: z.string().optional(),
        referrerType: z.string().optional(),
        profileId: z.string().optional(),
        sessionId: z.string().optional(),
        properties: z
          .record(z.string(), z.string())
          .optional()
          .describe('Exact matches on custom properties, keyed by bare key.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_QUERY_LIMIT)
          .default(DEFAULT_QUERY_LIMIT),
      }),
      execute: async (input) => {
        const range = resolveRange(ctx, input);
        const rows = await queryEventsCore(deps, {
          projectId,
          ...input,
          startDate: range.startDate,
          endDate: range.endDate,
        });
        return truncateRows(revenueToUnits(rows), input.limit);
      },
    }),

    query_sessions: tool({
      description:
        'Raw sessions matching filters, newest first: duration, pages, entry and exit, referrer, device, country.',
      inputSchema: z.object({
        ...zOptionalRange,
        country: z.string().optional(),
        city: z.string().optional(),
        device: z.string().optional(),
        browser: z.string().optional(),
        os: z.string().optional(),
        referrer: z.string().optional(),
        referrerName: z.string().optional(),
        referrerType: z.string().optional(),
        profileId: z.string().optional(),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_QUERY_LIMIT)
          .default(DEFAULT_QUERY_LIMIT),
      }),
      execute: async (input) => {
        const range = resolveRange(ctx, input);
        const rows = await querySessionsCore(deps, {
          projectId,
          ...input,
          startDate: range.startDate,
          endDate: range.endDate,
        });
        return truncateRows(revenueToUnits(rows), input.limit);
      },
    }),

    get_active_users: tool({
      description:
        'Daily, weekly or monthly active users: the current rolling count (`windowDays` 1, 7 or 30) plus a chart of daily unique users over the last `days`.',
      inputSchema: z.object({
        windowDays: z.number().int().min(1).max(90).default(1),
        days: z
          .number()
          .int()
          .min(1)
          .max(MAX_ACTIVE_USER_DAYS)
          .default(DEFAULT_ACTIVE_USER_DAYS),
      }),
      execute: async ({ windowDays, days }) => {
        const label =
          windowDays === 1
            ? 'Daily'
            : windowDays === DAYS_PER_WEEK
              ? 'Weekly'
              : windowDays === DEFAULT_ACTIVE_USER_DAYS
                ? 'Monthly'
                : `${windowDays}-day`;
        const report: IReportInput & { name: string } = {
          projectId,
          name: `Daily active users, last ${days} days`,
          chartType: 'linear',
          interval: 'day',
          range: 'custom',
          startDate: daysAgo(days - 1),
          endDate: daysAgo(0),
          metric: 'sum',
          previous: false,
          breakdowns: [],
          lineType: 'monotone',
          series: [eventSeries('A', 'screen_view', 'user', 'Active users')],
        };
        const [data, current] = await Promise.all([
          runReportConfig(ctx, report),
          getRollingActiveUsersCore(deps, { projectId, days: windowDays }),
        ]);
        const output: ChartToolOutput & { current: unknown; label: string } = {
          title: report.name,
          report,
          summary: summarizeChartData(data),
          current,
          label: `${label} active users`,
        };
        return output;
      },
      toModelOutput: ({ output }) => ({
        type: 'text' as const,
        value: JSON.stringify({
          ...chartModelSummary(output),
          current: output.current,
          label: output.label,
        }),
      }),
    }),

    get_funnel: tool({
      description:
        'Conversion through ordered steps: users per step, conversion and drop-off, drawn as a funnel chart. Verify step event names with describe_data first.',
      inputSchema: z.object({
        title: z.string().min(1).describe('3 to 8 words.'),
        steps: z.array(z.string()).min(2).max(MAX_FUNNEL_STEPS),
        ...zOptionalRange,
        windowHours: z
          .number()
          .int()
          .min(1)
          .max(MAX_FUNNEL_WINDOW_HOURS)
          .default(DEFAULT_FUNNEL_WINDOW_HOURS),
        groupBy: z.enum(['session_id', 'profile_id']).default('session_id'),
      }),
      execute: async ({
        title,
        steps,
        startDate,
        endDate,
        windowHours,
        groupBy,
      }) => {
        const range = resolveRange(ctx, { startDate, endDate });
        const report: IReportInput & { name: string } = {
          projectId,
          name: title,
          chartType: 'funnel',
          interval: 'day',
          range: 'custom',
          startDate: range.startDate,
          endDate: range.endDate,
          metric: 'sum',
          previous: false,
          breakdowns: [],
          options: {
            type: 'funnel',
            funnelGroup: groupBy,
            funnelWindow: windowHours * 3600,
          },
          series: steps.map((name, index) =>
            eventSeries(SERIES_IDS[index] ?? String(index), name, 'event')
          ),
        };
        const numbers = await getFunnelCore(deps, {
          projectId,
          steps,
          startDate: range.startDate,
          endDate: range.endDate,
          windowHours,
          groupBy,
        });
        const output: ChartToolOutput = {
          title,
          report,
          summary: numbers as unknown as Record<string, unknown>,
        };
        return output;
      },
      toModelOutput: ({ output }) => chartToModelOutput(output),
    }),

    get_retention: tool({
      description:
        'Weekly retention cohorts for the last 12 weeks: how many users who were first seen in a week came back in later weeks. Drawn as a retention chart.',
      inputSchema: z.object({}),
      execute: async () => {
        const cohorts = await getRetentionCohortCore(deps, projectId);
        const report: IReportInput & { name: string } = {
          projectId,
          name: 'Weekly retention',
          chartType: 'retention',
          interval: 'week',
          range: 'custom',
          startDate: daysAgo(RETENTION_WEEKS * DAYS_PER_WEEK),
          endDate: daysAgo(0),
          metric: 'sum',
          previous: false,
          breakdowns: [],
          series: [eventSeries('A', 'screen_view', 'user', 'Active users')],
        };
        const output: ChartToolOutput = {
          title: report.name,
          report,
          summary: { cohorts } as Record<string, unknown>,
        };
        return output;
      },
      toModelOutput: ({ output }) => chartToModelOutput(output),
    }),

    get_user_flow: tool({
      description:
        'Where users go after (or before) an event: the most common next steps, as nodes and links, drawn as a sankey chart.',
      inputSchema: z.object({
        startEvent: z.string(),
        endEvent: z
          .string()
          .optional()
          .describe('Required for mode `between`.'),
        mode: z.enum(['after', 'before', 'between']).default('after'),
        steps: z.number().int().min(2).max(10).default(5),
        ...zOptionalRange,
      }),
      execute: async ({
        startEvent,
        endEvent,
        mode,
        steps,
        startDate,
        endDate,
      }) => {
        const range = resolveRange(ctx, { startDate, endDate });
        const flow = await getUserFlowCore(deps, {
          projectId,
          startEvent,
          endEvent,
          mode,
          steps,
          startDate: range.startDate,
          endDate: range.endDate,
        });
        const series = [eventSeries('A', startEvent, 'event')];
        if (endEvent) {
          series.push(eventSeries('B', endEvent, 'event'));
        }
        const report: IReportInput & { name: string } = {
          projectId,
          name: `User flow ${mode} ${startEvent}`,
          chartType: 'sankey',
          interval: 'day',
          range: 'custom',
          startDate: range.startDate,
          endDate: range.endDate,
          metric: 'sum',
          previous: false,
          breakdowns: [],
          options: { type: 'sankey', mode, steps, exclude: [] },
          series,
        };
        const output: ChartToolOutput = {
          title: report.name,
          report,
          summary: flow as unknown as Record<string, unknown>,
        };
        return output;
      },
      toModelOutput: ({ output }) => chartToModelOutput(output),
    }),
  };
}
