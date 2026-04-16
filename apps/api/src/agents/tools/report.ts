import { z } from 'zod';
import { listEventPropertiesCore } from '@openpanel/db';
import { runReportFromConfig } from '@openpanel/mcp';
import type { IReportInput } from '@openpanel/validation';
import { chatTool, previousPeriod, resolveDateRange } from './helpers';

export const previewReportWithChanges = chatTool(
  {
    name: 'preview_report_with_changes',
    description:
      'Apply a partial diff to the current report draft, execute it, and return the resulting data + the modified config. Use this to PROPOSE edits — the user can then accept or reject. Pass only the fields you want to change (e.g. { breakdowns: [{ name: "country" }] }).',
    schema: z.object({
      chartType: z
        .enum(['linear', 'bar', 'area', 'histogram', 'pie', 'metric', 'funnel'])
        .optional(),
      interval: z.enum(['minute', 'hour', 'day', 'week', 'month']).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      addBreakdown: z
        .string()
        .optional()
        .describe('Property key to add as a breakdown (e.g. "country")'),
      removeBreakdown: z
        .string()
        .optional()
        .describe('Property key to remove from breakdowns'),
      addEventFilter: z
        .object({
          seriesIndex: z.number().min(0),
          name: z.string(),
          operator: z.string(),
          value: z.array(z.string()),
        })
        .optional(),
    }),
  },
  async (input, context) => {
    const draft = context.pageContext?.reportDraft as IReportInput | undefined;
    if (!draft) {
      return { error: 'No report draft available in the current context' };
    }

    const range = resolveDateRange({
      startDate: input.startDate ?? draft.startDate ?? undefined,
      endDate: input.endDate ?? draft.endDate ?? undefined,
    });

    const next: IReportInput = {
      ...draft,
      chartType: input.chartType ?? draft.chartType,
      interval: input.interval ?? draft.interval,
      startDate: range.startDate,
      endDate: range.endDate,
      range: 'custom',
      breakdowns: [...(draft.breakdowns ?? [])],
      series: draft.series.map((s) => ({ ...s })),
    };

    if (input.addBreakdown) {
      if (!next.breakdowns.some((b) => b.name === input.addBreakdown)) {
        next.breakdowns.push({
          id: String(next.breakdowns.length + 1),
          name: input.addBreakdown,
        });
      }
    }
    if (input.removeBreakdown) {
      next.breakdowns = next.breakdowns.filter(
        (b) => b.name !== input.removeBreakdown,
      );
    }
    if (input.addEventFilter) {
      const idx = input.addEventFilter.seriesIndex;
      const target = next.series[idx];
      if (target && idx >= 0 && target.type === 'event') {
        // biome-ignore lint/suspicious/noExplicitAny: series type is heavily discriminated; filter ops vary
        const series = target as any;
        series.filters = [
          ...(series.filters ?? []),
          {
            id: String((series.filters?.length ?? 0) + 1),
            name: input.addEventFilter.name,
            operator: input.addEventFilter.operator,
            value: input.addEventFilter.value,
          },
        ];
      }
    }

    return runReportFromConfig({
      organizationId: context.organizationId,
      projectId: context.projectId,
      config: next as unknown as Parameters<typeof runReportFromConfig>[0]['config'],
    });
  },
);

export const suggestBreakdowns = chatTool(
  {
    name: 'suggest_breakdowns',
    description:
      'Look at the events selected in the current draft and suggest 3-5 useful properties to break down by. Returns property keys + how often they appear.',
    schema: z.object({}),
  },
  async (_input, context) => {
    const draft = context.pageContext?.reportDraft as IReportInput | undefined;
    if (!draft) {
      return { error: 'No report draft available in the current context' };
    }

    const eventNames = draft.series
      .filter((s) => s.type === 'event')
      .map((s) => (s as { name: string }).name);

    if (eventNames.length === 0) {
      return { suggestions: [], note: 'Draft has no event series' };
    }

    const propsPerEvent = await Promise.all(
      eventNames.map((name) =>
        listEventPropertiesCore({
          projectId: context.projectId,
          eventName: name,
        }),
      ),
    );

    // Aggregate property keys across events
    const keyCount = new Map<string, number>();
    for (const r of propsPerEvent) {
      for (const p of r.properties) {
        keyCount.set(p.property_key, (keyCount.get(p.property_key) ?? 0) + 1);
      }
    }

    // Filter out keys that are already used as breakdowns
    const used = new Set((draft.breakdowns ?? []).map((b) => b.name));
    const suggestions = Array.from(keyCount.entries())
      .filter(([k]) => !used.has(k))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([key, count]) => ({ property_key: key, present_in_events: count }));

    return {
      events_in_draft: eventNames,
      existing_breakdowns: Array.from(used),
      suggestions,
    };
  },
);

export const compareToPreviousPeriod = chatTool(
  {
    name: 'compare_to_previous_period',
    description:
      'Run the current draft against the immediately preceding period of the same length, and return both as { current, previous } so the user can see week-over-week / month-over-month change.',
    schema: z.object({}),
  },
  async (_input, context) => {
    const draft = context.pageContext?.reportDraft as IReportInput | undefined;
    if (!draft) {
      return { error: 'No report draft available in the current context' };
    }

    const range = resolveDateRange({
      startDate: draft.startDate ?? undefined,
      endDate: draft.endDate ?? undefined,
    });
    const prev = previousPeriod(range.startDate, range.endDate);

    const [current, previous] = await Promise.all([
      runReportFromConfig({
        organizationId: context.organizationId,
        projectId: context.projectId,
        config: {
          ...(draft as unknown as Record<string, unknown>),
          startDate: range.startDate,
          endDate: range.endDate,
          range: 'custom',
        } as unknown as Parameters<typeof runReportFromConfig>[0]['config'],
      }),
      runReportFromConfig({
        organizationId: context.organizationId,
        projectId: context.projectId,
        config: {
          ...(draft as unknown as Record<string, unknown>),
          startDate: prev.startDate,
          endDate: prev.endDate,
          range: 'custom',
        } as unknown as Parameters<typeof runReportFromConfig>[0]['config'],
      }),
    ]);

    return { current, previous };
  },
);

export const findAnomaliesInCurrentReport = chatTool(
  {
    name: 'find_anomalies_in_current_report',
    description:
      'Run the current draft and find data points that are unusually high or low (z-score > 2 from rolling mean). Returns the anomalies with their dates and magnitudes.',
    schema: z.object({}),
  },
  async (_input, context) => {
    const draft = context.pageContext?.reportDraft as IReportInput | undefined;
    if (!draft) {
      return { error: 'No report draft available in the current context' };
    }

    const range = resolveDateRange({
      startDate: draft.startDate ?? undefined,
      endDate: draft.endDate ?? undefined,
    });

    const result = await runReportFromConfig({
      organizationId: context.organizationId,
      projectId: context.projectId,
      config: {
        ...(draft as unknown as Record<string, unknown>),
        startDate: range.startDate,
        endDate: range.endDate,
        range: 'custom',
      } as unknown as Parameters<typeof runReportFromConfig>[0]['config'],
    });

    // Best-effort anomaly detection on the first series of the result.
    // The data shape varies by chart type — we look for an array of
    // { date, count } points.
    // biome-ignore lint/suspicious/noExplicitAny: chart engine output shape is varied
    const data = result.data as any;
    const series = Array.isArray(data) ? data[0] : data?.series?.[0];
    const points = series?.data ?? [];

    if (!Array.isArray(points) || points.length < 5) {
      return {
        note: 'Not enough data points to detect anomalies',
        point_count: points.length ?? 0,
      };
    }

    const values = points.map((p: { count?: number }) => Number(p.count ?? 0));
    const mean = values.reduce((s: number, v: number) => s + v, 0) / values.length;
    const variance =
      values.reduce((s: number, v: number) => s + (v - mean) ** 2, 0) / values.length;
    const std = Math.sqrt(variance);

    const anomalies = points
      .map((p: { date?: string; count?: number }, i: number) => {
        const z = std === 0 ? 0 : (Number(p.count ?? 0) - mean) / std;
        return { date: p.date, value: p.count, z_score: Number(z.toFixed(2)), index: i };
      })
      .filter((a: { z_score: number }) => Math.abs(a.z_score) > 2);

    return {
      mean: Number(mean.toFixed(2)),
      std: Number(std.toFixed(2)),
      point_count: points.length,
      anomalies,
    };
  },
);

export const explainFilterImpact = chatTool(
  {
    name: 'explain_filter_impact',
    description:
      'Run the current draft both with and without its filters, and return both totals so the user can see how much the filters cut down the data.',
    schema: z.object({}),
  },
  async (_input, context) => {
    const draft = context.pageContext?.reportDraft as IReportInput | undefined;
    if (!draft) {
      return { error: 'No report draft available in the current context' };
    }

    const range = resolveDateRange({
      startDate: draft.startDate ?? undefined,
      endDate: draft.endDate ?? undefined,
    });

    const filtered = await runReportFromConfig({
      organizationId: context.organizationId,
      projectId: context.projectId,
      config: {
        ...(draft as unknown as Record<string, unknown>),
        startDate: range.startDate,
        endDate: range.endDate,
        range: 'custom',
      } as unknown as Parameters<typeof runReportFromConfig>[0]['config'],
    });

    const cleanedSeries = draft.series.map((s) => ({
      ...s,
      filters: [],
    }));

    const unfiltered = await runReportFromConfig({
      organizationId: context.organizationId,
      projectId: context.projectId,
      config: {
        ...(draft as unknown as Record<string, unknown>),
        series: cleanedSeries,
        startDate: range.startDate,
        endDate: range.endDate,
        range: 'custom',
      } as unknown as Parameters<typeof runReportFromConfig>[0]['config'],
    });

    return {
      with_filters: filtered,
      without_filters: unfiltered,
    };
  },
);
