import { tool } from 'ai';
import { z } from 'zod';
import {
  executeAggregateChart,
  executeChart,
} from '../../../chart/chart.service';
import { getFunnel } from '../../../chart/funnel.service';
import {
  chartTypes,
  type FinalChart,
  type IReportInput,
  intervals,
  lineTypes,
  operators,
  zReportInput,
} from '../../../report/report.constants';
import { getReportById } from '../../../report/report.service';
import { getChartStartEndDate } from '../../../report/src/chart-dates';
import type { ChatToolContext } from '../context';
import { dashboardUrl, errorResult } from './shared';

function enumKeys<K extends string>(record: Record<K, unknown>): [K, ...K[]] {
  const [first, ...rest] = Object.keys(record) as K[];
  return [first as K, ...rest];
}

/** Series are lettered so formulas can reference them. */
const SERIES_IDS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const MAX_SUMMARY_SERIES = 12;
const MAX_INLINE_POINTS = 62;
const MAX_LIMIT = 500;

const zEventSeriesInput = z.object({
  type: z.literal('event'),
  name: z.string().describe('Event name from describe_data.'),
  displayName: z.string().optional(),
  segment: z
    .enum([
      'event',
      'user',
      'session',
      'group',
      'user_average',
      'one_event_per_user',
      'property_sum',
      'property_average',
      'property_max',
      'property_min',
    ])
    .default('event')
    .describe(
      '`event` counts firings, `user` unique users, `session` unique sessions, `one_event_per_user` users who did it at least once, `property_*` aggregates a numeric `property`.'
    ),
  property: z
    .string()
    .optional()
    .describe('Numeric property for the property_* segments, e.g. `revenue`.'),
  filters: z
    .array(
      z.object({
        name: z
          .string()
          .describe('Bare column (`path`, `country`) or `properties.<key>`.'),
        operator: z.enum(enumKeys(operators)),
        value: z.array(
          z.union([z.string(), z.number(), z.boolean(), z.null()])
        ),
      })
    )
    .default([]),
});

const zFormulaSeriesInput = z.object({
  type: z.literal('formula'),
  formula: z
    .string()
    .describe('Arithmetic over series letters, e.g. `B / A * 100`.'),
  displayName: z.string().optional(),
  hideSeries: z
    .array(z.string())
    .optional()
    .describe('Letters of input series to hide from the chart.'),
});

export const zChartInput = z.object({
  title: z.string().min(1).describe('3 to 8 words. Shown as the card title.'),
  chartType: z.enum(enumKeys(chartTypes)),
  interval: z.enum(enumKeys(intervals)).default('day'),
  startDate: z.string().describe('YYYY-MM-DD'),
  endDate: z.string().describe('YYYY-MM-DD'),
  series: z.array(z.union([zEventSeriesInput, zFormulaSeriesInput])).min(1),
  breakdowns: z
    .array(z.object({ name: z.string() }))
    .default([])
    .describe('Group by a column or `properties.<key>`.'),
  metric: z
    .enum(['sum', 'count', 'average', 'min', 'max'])
    .optional()
    .describe(
      'Metric and map charts only. Omit unless the user asked for an aggregation; metric cards then show unique profiles.'
    ),
  previous: z
    .boolean()
    .optional()
    .describe('Overlay the previous period of equal length.'),
  lineType: z.enum(enumKeys(lineTypes)).optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .optional()
    .describe('Top N for bar, pie and sankey.'),
  unit: z.string().optional().describe('Y-axis unit: `%`, `$`, `ms`.'),
  funnelGroup: z
    .enum(['session_id', 'profile_id'])
    .optional()
    .describe('Funnel only: count unique sessions or unique profiles.'),
  funnelWindowHours: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Funnel only: hours a user has to complete all steps.'),
});

export type ChartInput = z.infer<typeof zChartInput>;

export type ChartSummary = Record<string, unknown>;

export interface ChartToolOutput {
  title: string;
  report: IReportInput & { name: string; id?: string };
  summary: ChartSummary;
  dashboardUrl?: string;
}

/** Builds the engine config from the model's flattened input, or a structured error the model can fix. */
export function buildReportConfig(
  ctx: ChatToolContext,
  input: ChartInput
):
  | { config: IReportInput & { name: string } }
  | { error: string; issues: unknown } {
  const series = input.series.map((entry, index) => {
    const id = SERIES_IDS[index] ?? String(index + 1);
    if (entry.type === 'formula') {
      return {
        id,
        type: 'formula' as const,
        formula: entry.formula,
        displayName: entry.displayName,
        hideSeries: entry.hideSeries,
      };
    }
    return {
      id,
      type: 'event' as const,
      name: entry.name,
      displayName: entry.displayName ?? entry.name,
      segment: entry.segment,
      property: entry.property,
      filters: entry.filters,
    };
  });

  const options =
    input.chartType === 'funnel'
      ? {
          type: 'funnel' as const,
          funnelGroup: input.funnelGroup ?? 'session_id',
          funnelWindow: input.funnelWindowHours
            ? input.funnelWindowHours * 3600
            : undefined,
        }
      : undefined;

  const parsed = zReportInput.safeParse({
    projectId: ctx.projectId,
    chartType: input.chartType,
    interval: input.interval,
    startDate: input.startDate,
    endDate: input.endDate,
    range: 'custom',
    series,
    breakdowns: input.breakdowns.map((breakdown, index) => ({
      id: String(index + 1),
      name: breakdown.name,
    })),
    // A metric card has always shown unique profiles; `sum` would turn
    // "1.2k users" into "45k events".
    metric: input.metric ?? (input.chartType === 'metric' ? 'count' : 'sum'),
    previous: input.previous ?? false,
    lineType: input.lineType ?? 'monotone',
    limit: input.limit,
    unit: input.unit,
    options,
    name: input.title,
  });
  if (!parsed.success) {
    return {
      error: 'Invalid chart config. Fix the issues and call again.',
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }
  return { config: { ...parsed.data, name: input.title } };
}

type EngineInput = Parameters<typeof executeChart>[1];

export async function runReportConfig(
  ctx: ChatToolContext,
  config: IReportInput
): Promise<unknown> {
  const engineInput = {
    ...config,
    projectId: ctx.projectId,
    timezone: ctx.timezone,
  } as unknown as EngineInput;
  if (config.chartType === 'funnel') {
    return getFunnel(ctx.deps, engineInput as Parameters<typeof getFunnel>[1]);
  }
  if (config.chartType === 'metric') {
    return executeAggregateChart(ctx.deps, engineInput);
  }
  return executeChart(ctx.deps, engineInput);
}

function isFinalChart(value: unknown): value is FinalChart {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { series?: unknown }).series)
  );
}

interface FunnelLike {
  totalSessions: number;
  steps: Array<{
    event: { name: string; displayName?: string };
    count: number;
    percent: number;
    dropoffCount: number | null;
    dropoffPercent: number | null;
  }>;
}

function isFunnelLike(value: unknown): value is FunnelLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { steps?: unknown }).steps)
  );
}

function summarizeSeries(chart: FinalChart): ChartSummary {
  const ordered = [...chart.series].sort(
    (a, b) => (b.metrics.sum ?? 0) - (a.metrics.sum ?? 0)
  );
  const series = ordered.slice(0, MAX_SUMMARY_SERIES).map((serie) => {
    const points = serie.data;
    let peak = points[0];
    let low = points[0];
    for (const point of points) {
      if (!peak || point.count > peak.count) {
        peak = point;
      }
      if (!low || point.count < low.count) {
        low = point;
      }
    }
    return {
      name: serie.names.join(' › '),
      ...serie.metrics,
      points: points.length,
      peak: peak ? { date: peak.date, value: peak.count } : undefined,
      low: low ? { date: low.date, value: low.count } : undefined,
      data:
        points.length <= MAX_INLINE_POINTS
          ? points.map((point) => [point.date, point.count])
          : undefined,
    };
  });
  return {
    total: chart.metrics,
    seriesCount: chart.series.length,
    omittedSeries: Math.max(0, chart.series.length - series.length),
    series,
  };
}

function summarizeFunnel(funnel: FunnelLike): ChartSummary {
  return {
    totalSessions: funnel.totalSessions,
    steps: funnel.steps.map((step) => ({
      event: step.event.displayName ?? step.event.name,
      count: step.count,
      percent: step.percent,
      dropoffCount: step.dropoffCount,
      dropoffPercent: step.dropoffPercent,
    })),
  };
}

const MAX_RAW_SUMMARY_CHARS = 4000;

/** The compact view of a chart's data the model reasons over; the UI renders the chart itself. */
export function summarizeChartData(data: unknown): ChartSummary {
  if (isFinalChart(data)) {
    return summarizeSeries(data);
  }
  if (isFunnelLike(data)) {
    return summarizeFunnel(data);
  }
  const raw = JSON.stringify(data) ?? '';
  return {
    raw:
      raw.length > MAX_RAW_SUMMARY_CHARS
        ? `${raw.slice(0, MAX_RAW_SUMMARY_CHARS)}…`
        : raw,
  };
}

/** Everything but the chart config: the UI needs the config, the model needs the numbers. */
export function chartModelSummary(
  output: ChartToolOutput | { error: string }
): Record<string, unknown> {
  if ('error' in output) {
    return output;
  }
  return {
    title: output.title,
    chartType: output.report.chartType,
    startDate: output.report.startDate,
    endDate: output.report.endDate,
    interval: output.report.interval,
    summary: output.summary,
    dashboardUrl: output.dashboardUrl,
    ...(usesRevenue(output.report)
      ? {
          note: 'Revenue sums here are in cents; divide by 100 for the amount.',
        }
      : {}),
  };
}

function usesRevenue(report: IReportInput): boolean {
  return report.series.some(
    (serie) => serie.type === 'event' && serie.property === 'revenue'
  );
}

export function chartToModelOutput(
  output: ChartToolOutput | { error: string }
) {
  return {
    type: 'text' as const,
    value: JSON.stringify(chartModelSummary(output)),
  };
}

export async function createChartOutput(
  ctx: ChatToolContext,
  input: ChartInput
): Promise<ChartToolOutput | { error: string; issues?: unknown }> {
  const built = buildReportConfig(ctx, input);
  if ('error' in built) {
    return built;
  }
  const data = await runReportConfig(ctx, built.config);
  const summary = summarizeChartData(data);
  if (
    built.config.breakdowns.length > 0 &&
    isFinalChart(data) &&
    data.series.length <= 1
  ) {
    summary.note =
      'The breakdown produced a single group, so the event does not carry that property. UTM parameters and referrers live on screen_view and session_start events, not on purchase or revenue events; for revenue by source or campaign use get_traffic_attribution.';
  }
  return {
    title: input.title,
    report: built.config,
    summary,
  };
}

export function chartTools(ctx: ChatToolContext) {
  return {
    create_chart: tool({
      description:
        'Render a chart in the chat from events in this project. Pick the chart type for the question: `linear` for trends over time, `bar` for top-N comparisons, `pie` for shares (max 6 slices), `metric` for one number, `funnel` for ordered steps, `retention` for cohorts (use interval week), `conversion` for an A-to-B rate over time, `sankey` for user flows, `map` for countries, `histogram` for distributions. Verify event and property names with describe_data first. You get the numbers back as a summary; the user sees the chart.',
      inputSchema: zChartInput,
      execute: (input) => createChartOutput(ctx, input),
      toModelOutput: ({ output }) => chartToModelOutput(output),
    }),

    get_report: tool({
      description:
        'Run a saved report by id and show it as a chart. Use list_dashboards and list_reports to find ids. Prefer a saved report when one already answers the question.',
      inputSchema: z.object({ reportId: z.string() }),
      execute: async ({ reportId }) => {
        const report = await getReportById(ctx.deps, reportId);
        if (!report || report.projectId !== ctx.projectId) {
          return errorResult('Report not found', { reportId });
        }
        const { startDate, endDate } = getChartStartEndDate(
          report,
          ctx.timezone
        );
        const { layout: _layout, ...config } = report;
        const data = await runReportConfig(ctx, {
          ...config,
          startDate,
          endDate,
        });
        const output: ChartToolOutput = {
          title: report.name,
          report: { ...config, name: report.name, id: report.id },
          summary: summarizeChartData(data),
          dashboardUrl: dashboardUrl(ctx, `/reports/${report.id}`),
        };
        return output;
      },
      toModelOutput: ({ output }) => chartToModelOutput(output),
    }),
  };
}
