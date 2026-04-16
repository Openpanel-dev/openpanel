import {
  chartTypes,
  lineTypes,
  operators,
} from '@openpanel/constants';
import { objectToZodEnums, zReportInput } from '@openpanel/validation';
import { z } from 'zod';
import {
  findProfilesCore,
  getAnalyticsOverviewCore,
  getEventPropertyValuesCore,
  getFunnelCore,
  getRetentionCohortCore,
  getRollingActiveUsersCore,
  getTopPagesCore,
  getTrafficBreakdownCore,
  getUserFlowCore,
  listDashboardsCore,
  listEventNamesCore,
  listEventPropertiesCore,
  listReportsCore,
  queryEventsCore,
  querySessionsCore,
} from '@openpanel/db';
import { runReport, runReportFromConfig } from '@openpanel/mcp';
import {
  chatTool,
  dashboardUrl,
  pageContextFilters,
  resolveDateRange,
  truncateRows,
} from './helpers';

// ─────────────────────────────────────────────────────────────────
// DISCOVERY
// ─────────────────────────────────────────────────────────────────

export const listEventNames = chatTool(
  {
    name: 'list_event_names',
    description:
      'Get the top 50 event names tracked in this project. Call this BEFORE referencing event names in generate_report or other tools — never guess at event names.',
    schema: z.object({}),
  },
  async (_input, context) => {
    const names = await listEventNamesCore(context.projectId);
    return { event_names: names };
  },
);

export const listEventProperties = chatTool(
  {
    name: 'list_event_properties',
    description:
      'List the property keys available for an event (or all events). Call this before using a property as a filter or breakdown in generate_report.',
    schema: z.object({
      eventName: z
        .string()
        .optional()
        .describe('Optional — filter to one event. Omit to list properties across all events.'),
    }),
  },
  async ({ eventName }, context) =>
    listEventPropertiesCore({ projectId: context.projectId, eventName }),
);

export const getEventPropertyValues = chatTool(
  {
    name: 'get_event_property_values',
    description:
      'List distinct values for a specific event property. Useful when the user wants to filter on something concrete like "country = SE".',
    schema: z.object({
      eventName: z.string().describe('The event name (e.g. screen_view)'),
      propertyKey: z.string().describe('The property key (e.g. path, country)'),
    }),
  },
  async ({ eventName, propertyKey }, context) =>
    getEventPropertyValuesCore({
      projectId: context.projectId,
      eventName,
      propertyKey,
    }),
);

// ─────────────────────────────────────────────────────────────────
// SAVED DASHBOARDS & REPORTS (PREFER THESE OVER generate_report)
// ─────────────────────────────────────────────────────────────────

export const listDashboards = chatTool(
  {
    name: 'list_dashboards',
    description:
      'List all dashboards in this project. Each dashboard groups a set of reports the user has built. Use this to discover what already exists before building anything new.',
    schema: z.object({}),
  },
  async (_input, context) => {
    const dashboards = await listDashboardsCore({
      projectId: context.projectId,
      organizationId: context.organizationId,
    });
    return dashboards.map((d) => ({
      ...d,
      dashboard_url: dashboardUrl(context.organizationId, context.projectId, `/dashboards/${d.id}`),
    }));
  },
);

export const listReports = chatTool(
  {
    name: 'list_reports',
    description:
      'List the reports inside a dashboard. Returns chart type, range, interval, and event series for each. Use this with get_report_data to fetch real numbers.',
    schema: z.object({
      dashboardId: z.string().describe('The dashboard ID (from list_dashboards)'),
    }),
  },
  async ({ dashboardId }, context) =>
    listReportsCore({
      projectId: context.projectId,
      dashboardId,
      organizationId: context.organizationId,
    }),
);

export const getReportData = chatTool(
  {
    name: 'get_report_data',
    description:
      'Execute a saved report by ID and return its data. Works for every chart type (linear, bar, area, pie, metric, funnel, retention, etc.). PREFER this over generate_report when the user asks about something a saved report likely already covers.',
    schema: z.object({
      reportId: z.string().describe('The report ID (from list_reports)'),
    }),
  },
  async ({ reportId }, context) =>
    runReport({
      organizationId: context.organizationId,
      projectId: context.projectId,
      reportId,
    }),
);

export const generateReport = chatTool(
  {
    name: 'generate_report',
    description: [
      "Generate an ad-hoc chart from a report config. Use only when no saved report fits. Always call list_event_names first to verify event names exist; call list_event_properties if you need a breakdown property. ALWAYS supply a concise `title` (3-8 words) describing what the chart shows.",
      '',
      'Series are ordered A, B, C, … (based on array index). Use the letter id from a `formula` series like "A / B * 100" for ratios or conversions.',
      '',
      'Examples:',
      '- **Unique users per day**: one event series with `segment: "user"` + `chartType: "linear"`.',
      '- **Revenue per day**: one event series with `segment: "property_sum"` + `property: "revenue"`.',
      '- **Conversion rate over time**: two event series (A = completed, B = started) + a `formula` series `"A / B * 100"` with all three visible, or set `hideSeries: ["A","B"]` to show only the rate.',
      '- **Period-over-period**: set `previous: true` to overlay the prior period of equal length.',
    ].join('\n'),
    schema: z.object({
      chartType: z
        .enum(objectToZodEnums(chartTypes))
        .describe(
          'Chart type. See the decision table in the system prompt — pick `linear`/`area` for trends, `bar`/`pie`/`map` for breakdowns, `metric` for a single number, `funnel`/`conversion`/`sankey` for flows, `retention` for cohorts, `histogram` for numeric distributions.',
        ),
      interval: z
        .enum(['minute', 'hour', 'day', 'week', 'month'])
        .default('day'),
      startDate: z.string().describe('ISO date YYYY-MM-DD'),
      endDate: z.string().describe('ISO date YYYY-MM-DD'),
      series: z
        .array(
          z.union([
            z.object({
              type: z.literal('event'),
              name: z.string().describe('Event name — verify with list_event_names'),
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
                .optional()
                .describe(
                  [
                    'How to segment/aggregate the event:',
                    '- `event` — every event firing (default, "all events")',
                    '- `user` — unique users (e.g. for DAU/MAU)',
                    '- `session` — unique sessions',
                    '- `group` — unique groups/accounts',
                    '- `user_average` — average events per user',
                    '- `one_event_per_user` — count users who did it at least once',
                    '- `property_sum` / `property_average` / `property_max` / `property_min` — aggregate a numeric property from the event (requires `property`)',
                  ].join('\n'),
                ),
              property: z
                .string()
                .optional()
                .describe(
                  'Numeric property on the event to aggregate. Required when segment is `property_sum`/`average`/`max`/`min`. Example: `revenue`, `duration`, `score`.',
                ),
              filters: z
                .array(
                  z.object({
                    name: z
                      .string()
                      .describe('Property key — verify with list_event_properties'),
                    operator: z
                      .enum(objectToZodEnums(operators))
                      .describe(
                        'One of: is, isNot, contains, doesNotContain, startsWith, endsWith, regex, isNull, isNotNull, gt, lt, gte, lte. `is` is the default for equality (NOT `equals` / `eq` / `==`).',
                      ),
                    value: z
                      .array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
                      .describe('Values to match. Use [] with isNull/isNotNull.'),
                  }),
                )
                .default([])
                .optional(),
            }),
            z.object({
              type: z.literal('formula'),
              formula: z
                .string()
                .describe(
                  'Expression referencing other series by letter id. Examples: `A / B * 100` (conversion rate), `A + B` (union total), `A - B` (difference). Earlier series are A, B, C, …',
                ),
              displayName: z.string().optional(),
              hideSeries: z
                .array(z.string())
                .optional()
                .describe(
                  'Letter ids (e.g. ["A", "B"]) of series used by the formula that should be hidden from the chart — useful when you only want to display the computed ratio.',
                ),
            }),
          ]),
        )
        .min(1)
        .describe('At least one series. Mix event series and formula series to compute ratios.'),
      breakdowns: z
        .array(
          z.object({
            name: z.string().describe('Property key to group by'),
          }),
        )
        .default([])
        .optional(),
      metric: z.enum(['sum', 'count', 'average']).default('sum').optional(),
      previous: z
        .boolean()
        .optional()
        .describe(
          'Overlay the same-length previous period for comparison. Great for "vs last week" / "vs last month" questions.',
        ),
      lineType: z
        .enum(objectToZodEnums(lineTypes))
        .optional()
        .describe(
          'Line style for linear/area charts. Default to `monotone` unless you have a reason not to.',
        ),
      limit: z
        .number()
        .min(1)
        .max(500)
        .optional()
        .describe('Top-N limit for bar/pie/sankey. Example: "top 10 pages" → limit: 10.'),
      unit: z
        .string()
        .optional()
        .describe('Y-axis unit suffix, e.g. `%`, `$`, `ms`, `users`.'),
      funnelGroup: z
        .enum(['session', 'profile'])
        .optional()
        .describe(
          'Only for `chartType: "funnel"`. Whether each funnel step counts by unique session or unique profile. Default is profile.',
        ),
      title: z
        .string()
        .optional()
        .describe(
          'Short, descriptive card title (3-8 words) — e.g. "Signups per day, last 7 days". Always provide one.',
        ),
    }),
  },
  async (input, context) => {
    // biome-ignore lint/suspicious/noExplicitAny: union discrimination between event/formula series is easier to do explicitly
    const series = (input.series as any[]).map((s: any, i: number) => {
      const id = ALPHABET_IDS[i] ?? String(i + 1);
      if (s?.type === 'formula') {
        return {
          id,
          type: 'formula' as const,
          formula: s.formula,
          displayName: s.displayName,
          ...(Array.isArray(s.hideSeries) ? { hideSeries: s.hideSeries } : {}),
        };
      }
      return {
        id,
        type: 'event' as const,
        name: s.name,
        displayName: s.displayName ?? s.name,
        segment: s.segment ?? 'event',
        ...(s.property ? { property: s.property } : {}),
        filters: s.filters ?? [],
      };
    });

    const options =
      input.chartType === 'funnel' && input.funnelGroup
        ? { type: 'funnel' as const, funnelGroup: input.funnelGroup }
        : undefined;

    const config = {
      projectId: context.projectId,
      chartType: input.chartType,
      interval: input.interval,
      startDate: input.startDate,
      endDate: input.endDate,
      series,
      breakdowns: (input.breakdowns ?? []).map(
        (b: { name: string }, i: number) => ({
          id: String(i + 1),
          name: b.name,
        }),
      ),
      range: 'custom' as const,
      metric: input.metric ?? 'sum',
      previous: input.previous ?? false,
      ...(input.lineType ? { lineType: input.lineType } : {}),
      ...(input.limit ? { limit: input.limit } : {}),
      ...(input.unit ? { unit: input.unit } : {}),
      ...(options ? { options } : {}),
    };

    // Pre-validate against the real report schema so invalid shapes
    // (bad operator, wrong filter value type, unknown chartType) are
    // returned to the model as a structured error, letting the agent
    // loop self-correct instead of producing a broken chart.
    const parsed = zReportInput.safeParse(config);
    if (!parsed.success) {
      return {
        error: 'Invalid report config — fix the issues and call generate_report again.',
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      };
    }

    const chart = await runReportFromConfig({
      organizationId: context.organizationId,
      projectId: context.projectId,
      config: parsed.data as Parameters<typeof runReportFromConfig>[0]['config'],
    });
    return {
      // Use the model-supplied title when present; the frontend
      // falls back to a derived title from input if this is empty.
      ...(input.title?.trim() ? { name: input.title.trim() } : {}),
      ...chart,
    };
  },
);

// Letter ids for series. Must match the chart engine's expectation
// that series are referenced by A, B, C, … in formula expressions.
const ALPHABET_IDS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J',
  'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T',
  'U', 'V', 'W', 'X', 'Y', 'Z',
] as const;

// ─────────────────────────────────────────────────────────────────
// AGGREGATE ANALYTICS — default to current page's filters
// ─────────────────────────────────────────────────────────────────

export const getAnalyticsOverview = chatTool(
  {
    name: 'get_analytics_overview',
    description:
      'Top-level metrics: unique visitors, total pageviews, sessions, bounce rate, avg session duration, plus an optional time series. Defaults to the user\'s current date range.',
    schema: z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      interval: z.enum(['hour', 'day', 'week', 'month']).default('day').optional(),
    }),
  },
  async ({ startDate, endDate, interval }, context) => {
    const pageContext = context.pageContext;
    const range = resolveDateRange({
      ...pageContext?.filters,
      startDate: startDate ?? pageContext?.filters?.startDate,
      endDate: endDate ?? pageContext?.filters?.endDate,
    });
    return getAnalyticsOverviewCore({
      projectId: context.projectId,
      startDate: range.startDate,
      endDate: range.endDate,
      interval: interval ?? 'day',
      filters: pageContextFilters(pageContext),
    });
  },
);

export const getTopPages = chatTool(
  {
    name: 'get_top_pages',
    description:
      'Top pages ranked by visitors / pageviews. Returns path, sessions, pageviews, bounce rate, avg duration. Respects the page\'s active property filters.',
    schema: z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      limit: z.number().min(1).max(100).default(20).optional(),
    }),
  },
  async ({ startDate, endDate, limit }, context) => {
    const pageContext = context.pageContext;
    const range = resolveDateRange({
      ...pageContext?.filters,
      startDate: startDate ?? pageContext?.filters?.startDate,
      endDate: endDate ?? pageContext?.filters?.endDate,
    });
    const pages = await getTopPagesCore({
      projectId: context.projectId,
      startDate: range.startDate,
      endDate: range.endDate,
      limit: limit ?? 20,
      filters: pageContextFilters(pageContext),
    });
    return truncateRows(pages, 50);
  },
);

export const getTopReferrers = chatTool(
  {
    name: 'get_top_referrers',
    description:
      'Traffic source breakdown — by referrer name, type, or UTM source/medium/campaign. Respects the page\'s active property filters.',
    schema: z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      breakdown: z
        .enum(['referrer_name', 'referrer_type', 'referrer'])
        .default('referrer_name')
        .optional(),
    }),
  },
  async ({ startDate, endDate, breakdown }, context) => {
    const pageContext = context.pageContext;
    const range = resolveDateRange({
      ...pageContext?.filters,
      startDate: startDate ?? pageContext?.filters?.startDate,
      endDate: endDate ?? pageContext?.filters?.endDate,
    });
    const rows = await getTrafficBreakdownCore({
      projectId: context.projectId,
      startDate: range.startDate,
      endDate: range.endDate,
      column: (breakdown ?? 'referrer_name') as 'referrer_name' | 'referrer_type' | 'referrer',
      filters: pageContextFilters(pageContext),
    });
    return truncateRows(rows, 50);
  },
);

export const getCountryBreakdown = chatTool(
  {
    name: 'get_country_breakdown',
    description:
      'Visitor breakdown by country / region / city. Returns sessions and percentage of total. Respects the page\'s active property filters.',
    schema: z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      breakdown: z
        .enum(['country', 'region', 'city'])
        .default('country')
        .optional(),
    }),
  },
  async ({ startDate, endDate, breakdown }, context) => {
    const pageContext = context.pageContext;
    const range = resolveDateRange({
      ...pageContext?.filters,
      startDate: startDate ?? pageContext?.filters?.startDate,
      endDate: endDate ?? pageContext?.filters?.endDate,
    });
    const rows = await getTrafficBreakdownCore({
      projectId: context.projectId,
      startDate: range.startDate,
      endDate: range.endDate,
      column: (breakdown ?? 'country') as 'country' | 'region' | 'city',
      filters: pageContextFilters(pageContext),
    });
    return truncateRows(rows, 100);
  },
);

export const getDeviceBreakdown = chatTool(
  {
    name: 'get_device_breakdown',
    description:
      'Visitor breakdown by device / browser / OS. Respects the page\'s active property filters.',
    schema: z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      breakdown: z
        .enum(['device', 'browser', 'os'])
        .default('device')
        .optional(),
    }),
  },
  async ({ startDate, endDate, breakdown }, context) => {
    const pageContext = context.pageContext;
    const range = resolveDateRange({
      ...pageContext?.filters,
      startDate: startDate ?? pageContext?.filters?.startDate,
      endDate: endDate ?? pageContext?.filters?.endDate,
    });
    const rows = await getTrafficBreakdownCore({
      projectId: context.projectId,
      startDate: range.startDate,
      endDate: range.endDate,
      column: (breakdown ?? 'device') as 'device' | 'browser' | 'os',
      filters: pageContextFilters(pageContext),
    });
    return truncateRows(rows, 50);
  },
);

export const getRollingActiveUsers = chatTool(
  {
    name: 'get_rolling_active_users',
    description:
      "Rolling active-users trend (DAU/WAU/MAU). Returns BOTH the latest single value AND a renderable chart config (so the UI draws a line chart). Default is DAU over 30 days; pass `windowDays: 7` for WAU or `windowDays: 30` for MAU. ALWAYS supply a concise `title` (3-8 words) that describes what the chart shows.",
    schema: z.object({
      /**
       * The rolling window. 1 = DAU (default), 7 = WAU, 30 = MAU.
       */
      windowDays: z.number().min(1).max(90).default(1).optional(),
      /** Number of days to chart. Defaults to 30. */
      days: z.number().min(1).max(365).default(30).optional(),
      title: z
        .string()
        .optional()
        .describe(
          'Short, descriptive card title (3-8 words) — e.g. "Monthly active users trend". Always provide one.',
        ),
    }),
  },
  async ({ windowDays, days, title }, context) => {
    const window = windowDays ?? 1;
    const range = days ?? 30;

    // Build a chart config that represents "unique users per day".
    // We use a user-segment on `screen_view` — OpenPanel's standard
    // pageview event — with a linear chart. The ChartEngine dedupes
    // per profile_id because of `segment: 'user'`.
    const endDate = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - (range - 1) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const label =
      window === 1 ? 'DAU' : window === 7 ? 'WAU' : window === 30 ? 'MAU' : `${window}-day active users`;

    const config = {
      chartType: 'linear' as const,
      interval: 'day' as const,
      startDate,
      endDate,
      range: 'custom' as const,
      metric: 'sum' as const,
      previous: false,
      breakdowns: [],
      series: [
        {
          id: '1',
          type: 'event' as const,
          name: 'screen_view',
          displayName: label,
          segment: 'user' as const,
          filters: [],
        },
      ],
    };

    const chart = await runReportFromConfig({
      organizationId: context.organizationId,
      projectId: context.projectId,
      config: config as Parameters<typeof runReportFromConfig>[0]['config'],
    });

    // Also keep the rolling summary so the model can quote the
    // single-number "MAU is 205,127" line.
    const summary = await getRollingActiveUsersCore({
      projectId: context.projectId,
      days: window,
    });

    return {
      // `name` is the title the frontend `ChatReportResult` uses for
      // the card header. The model is asked to supply a `title` —
      // we use it when present, falling back to a generic label.
      name: title?.trim() || `${label} — last ${range} days`,
      label,
      window,
      summary,
      // Keys the frontend report renderer knows about.
      ...chart,
    };
  },
);

export const getFunnel = chatTool(
  {
    name: 'get_funnel',
    description:
      'Multi-step conversion funnel. Returns BOTH a renderable funnel chart AND the numeric breakdown (users per step, conversion rates, drop-off). The UI draws an actual funnel chart. Provide an ordered list of event names — verify with list_event_names first. ALWAYS supply a concise `title` (3-8 words) describing what the funnel measures.',
    schema: z.object({
      steps: z
        .array(z.string())
        .min(2)
        .max(10)
        .describe('Ordered event names. Verify with list_event_names first.'),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      windowHours: z.number().min(1).max(720).default(24).optional(),
      groupBy: z
        .enum(['session_id', 'profile_id'])
        .default('session_id')
        .optional(),
      title: z
        .string()
        .optional()
        .describe(
          'Short, descriptive card title (3-8 words) — e.g. "Cart to checkout conversion" or "Signup to paid funnel". Always provide one.',
        ),
    }),
  },
  async ({ steps, startDate, endDate, windowHours, groupBy, title }, context) => {
    const pageContext = context.pageContext;
    const range = resolveDateRange({
      ...pageContext?.filters,
      startDate: startDate ?? pageContext?.filters?.startDate,
      endDate: endDate ?? pageContext?.filters?.endDate,
    });

    // Raw funnel numbers — step-by-step breakdown for the model to
    // reason about.
    const numbers = await getFunnelCore({
      projectId: context.projectId,
      steps,
      startDate: range.startDate,
      endDate: range.endDate,
      windowHours,
      groupBy,
    });

    // Chart config — same shape `generate_report` returns, so the
    // frontend's `ChatReportResult` renderer draws an actual funnel
    // chart via `<ReportChart>`.
    const chartConfig = {
      chartType: 'funnel' as const,
      interval: 'day' as const,
      startDate: range.startDate,
      endDate: range.endDate,
      range: 'custom' as const,
      metric: 'sum' as const,
      previous: false,
      breakdowns: [],
      funnelGroup: groupBy ?? 'session_id',
      funnelWindowSeconds: (windowHours ?? 24) * 3600,
      series: (steps as string[]).map((name: string, i: number) => ({
        id: String(i + 1),
        type: 'event' as const,
        name,
        displayName: name,
        segment: 'event' as const,
        filters: [],
      })),
    };

    const chart = await runReportFromConfig({
      organizationId: context.organizationId,
      projectId: context.projectId,
      config: chartConfig as Parameters<typeof runReportFromConfig>[0]['config'],
    });

    return {
      name: title?.trim() || `Funnel: ${steps.join(' → ')}`,
      numbers,
      // Keys the frontend report renderer knows about.
      ...chart,
    };
  },
);

export const getRetentionCohort = chatTool(
  {
    name: 'get_retention_cohort',
    description:
      'Weekly user retention cohort table. Each row is a cohort week, columns are retention percentages for subsequent weeks.',
    schema: z.object({}),
  },
  async (_input, context) => getRetentionCohortCore(context.projectId),
);

export const getUserFlow = chatTool(
  {
    name: 'get_user_flow',
    description:
      'Sankey-style user navigation flow from a starting event. Returns nodes + links suitable for visualizing common paths.',
    schema: z.object({
      startEvent: z.string().describe('Event name where the flow starts'),
      endEvent: z
        .string()
        .optional()
        .describe('Required when mode=between'),
      mode: z.enum(['after', 'before', 'between']).default('after'),
      steps: z.number().min(2).max(10).default(5).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }),
  },
  async ({ startEvent, endEvent, mode, steps, startDate, endDate }, context) => {
    const pageContext = context.pageContext;
    const range = resolveDateRange({
      ...pageContext?.filters,
      startDate: startDate ?? pageContext?.filters?.startDate,
      endDate: endDate ?? pageContext?.filters?.endDate,
    });
    return getUserFlowCore({
      projectId: context.projectId,
      startEvent,
      endEvent,
      mode,
      steps,
      startDate: range.startDate,
      endDate: range.endDate,
    });
  },
);

// ─────────────────────────────────────────────────────────────────
// FREE-FORM QUERIES (escape hatches when nothing else fits)
// ─────────────────────────────────────────────────────────────────

export const queryEvents = chatTool(
  {
    name: 'query_events',
    description:
      'Free-form query over raw events with filters (path, country, device, browser, OS, referrer, custom properties, profileId, eventNames). Use this when aggregate tools don\'t cover the question.',
    schema: z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
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
      properties: z.record(z.string(), z.string()).optional(),
      limit: z.number().min(1).max(100).default(20).optional(),
    }),
  },
  async (input, context) => {
    const pageContext = context.pageContext;
    const range = resolveDateRange({
      ...pageContext?.filters,
      startDate: input.startDate ?? pageContext?.filters?.startDate,
      endDate: input.endDate ?? pageContext?.filters?.endDate,
    });
    const rows = await queryEventsCore({
      projectId: context.projectId,
      ...input,
      startDate: range.startDate,
      endDate: range.endDate,
      limit: input.limit ?? 20,
    });
    return truncateRows(rows, 100);
  },
);

export const querySessions = chatTool(
  {
    name: 'query_sessions',
    description:
      'Free-form query over raw sessions with filters (country, device, browser, OS, referrer, profileId).',
    schema: z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      country: z.string().optional(),
      city: z.string().optional(),
      device: z.string().optional(),
      browser: z.string().optional(),
      os: z.string().optional(),
      referrer: z.string().optional(),
      referrerName: z.string().optional(),
      referrerType: z.string().optional(),
      profileId: z.string().optional(),
      limit: z.number().min(1).max(100).default(20).optional(),
    }),
  },
  async (input, context) => {
    const pageContext = context.pageContext;
    const range = resolveDateRange({
      ...pageContext?.filters,
      startDate: input.startDate ?? pageContext?.filters?.startDate,
      endDate: input.endDate ?? pageContext?.filters?.endDate,
    });
    const rows = await querySessionsCore({
      projectId: context.projectId,
      ...input,
      startDate: range.startDate,
      endDate: range.endDate,
      limit: input.limit ?? 20,
    });
    return truncateRows(rows, 100);
  },
);

export const findProfiles = chatTool(
  {
    name: 'find_profiles',
    description:
      'Search for user profiles by name, email, country, device, inactivity, minimum sessions, or having performed a specific event.',
    schema: z.object({
      name: z.string().optional(),
      email: z.string().optional(),
      country: z.string().optional(),
      city: z.string().optional(),
      device: z.string().optional(),
      browser: z.string().optional(),
      inactiveDays: z.number().min(1).optional(),
      minSessions: z.number().min(1).optional(),
      performedEvent: z.string().optional(),
      sortOrder: z.enum(['asc', 'desc']).default('desc').optional(),
      limit: z.number().min(1).max(100).default(20).optional(),
    }),
  },
  async (input, context) => {
    const profiles = await findProfilesCore({
      projectId: context.projectId,
      ...input,
    });
    return truncateRows(
      profiles.map((p) => ({
        ...p,
        dashboard_url: dashboardUrl(context.organizationId, context.projectId, `/profiles/${p.id}`),
      })),
      100,
    );
  },
);
