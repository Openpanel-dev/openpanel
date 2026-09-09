// Ported from packages/db/src/services/overview.service.ts. The ClickHouse
// queries moved to src/overview.sql.ts (ADR-013, M7-005).
//
// M10-005: `OverviewService` is no longer a class and there is no
// `overviewService` module singleton. Every method is a module-scope function
// taking `ServiceDeps` first and otherwise the same arguments, and
// `createOverviewService(deps)` binds them under their old method names, so
// `services.overview.getMetrics(input)` reads exactly as
// `overviewService.getMetrics(input)` did. The caller-supplied
// `constructor(client)` slot is gone with it: the client is `deps.ch`, which
// is what puts the request's id on the query's log line (ADR-018 R1).

import type { SqlFragment } from '@openpanel/db/src/clickhouse/sql';
import { z } from 'zod';
import type { ServiceDeps, Services } from '../../services';
import { average, sum } from '../../shared/math';
import { convertClickhouseDateToJs } from '../chart/src/dates';
import {
  getEventFiltersWhereClause,
  joinFilterClauses,
} from '../chart/src/filter-where';
import { getSettingsForProject } from '../organization/organization.service';
import type { IChartEventFilter, IInterval } from '../report/report.constants';
import { chartColors, zTimeInterval } from '../report/report.constants';
import {
  distinctSessionsQuery,
  liveMinuteCountsQuery,
  liveMinuteReferrersQuery,
  liveReferrersQuery,
  liveTotalSessionsQuery,
  mapDataQuery,
  metricsWithPageFilterQuery,
  revenueQuery,
  sessionMetricsQuery,
  topEntriesQuery,
  topEntryExitQuery,
  topEventsQuery,
  topGenericQuery,
  topGenericSeriesTimeSeriesQuery,
  topGenericSeriesTopItemsQuery,
  topLinkOutQuery,
  topPagesQuery,
  transitionsQuery,
} from './src/overview.sql';
import { runQuery } from './src/run-query';

// Toggle revenue tracking in overview queries
const INCLUDE_REVENUE = true; // TODO: Make this configurable later

// Maximum number of records to return (for detail modals)
const MAX_RECORDS_LIMIT = 1000;

const ROLLUP_DATE_PREFIX = '1970-01-01';

function isClickhouseDefaultMinDate(date: string): boolean {
  return date.startsWith(ROLLUP_DATE_PREFIX) || date.startsWith('1969-12-31');
}

const COLUMN_PREFIX_MAP: Record<string, string> = {
  region: 'country',
  city: 'country',
  browser_version: 'browser',
  os_version: 'os',
};

const WHITELISTED_FILTERS = [
  'os',
  'path',
  'city',
  'brand',
  'model',
  'origin',
  'region',
  'device',
  'revenue',
  'country',
  'browser',
  'referrer',
  'os_version',
  'referrer_name',
  'browser_version',
  'referrer_type',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
];

// Columns that exist on the sessions table but not on events — on events
// they're stored inside the properties map under __query.utm_*.
const UTM_COLUMNS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
];

// Types
type MetricsRow = {
  bounce_rate: number;
  unique_visitors: number;
  total_sessions: number;
  avg_session_duration: number;
  total_screen_views: number;
  views_per_session: number;
};

type MetricsSeriesRow = MetricsRow & { date: string; total_revenue: number };

export const zGetMetricsInput = z.object({
  projectId: z.string(),
  filters: z.array(z.any()),
  startDate: z.string(),
  endDate: z.string(),
  interval: zTimeInterval,
});

export type IGetMetricsInput = z.infer<typeof zGetMetricsInput> & {
  timezone: string;
};

export const zGetTopPagesInput = z.object({
  projectId: z.string(),
  filters: z.array(z.any()),
  startDate: z.string(),
  endDate: z.string(),
  limit: z.number().min(1).max(1000).optional(),
});

export type IGetTopPagesInput = z.infer<typeof zGetTopPagesInput> & {
  timezone: string;
};

export const zGetTopEntryExitInput = z.object({
  projectId: z.string(),
  filters: z.array(z.any()),
  startDate: z.string(),
  endDate: z.string(),
  mode: z.enum(['entry', 'exit']),
  limit: z.number().min(1).max(1000).optional(),
});

export type IGetTopEntryExitInput = z.infer<typeof zGetTopEntryExitInput> & {
  timezone: string;
};

export const zGetTopGenericInput = z.object({
  projectId: z.string(),
  filters: z.array(z.any()),
  startDate: z.string(),
  endDate: z.string(),
  column: z.enum([
    // Referrers
    'referrer',
    'referrer_name',
    'referrer_type',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    // Geo
    'region',
    'country',
    'city',
    // Device
    'device',
    'brand',
    'model',
    'browser',
    'browser_version',
    'os',
    'os_version',
  ]),
});

export type IGetTopGenericInput = z.infer<typeof zGetTopGenericInput> & {
  timezone: string;
};

export const zGetTopGenericSeriesInput = zGetTopGenericInput.extend({
  interval: zTimeInterval,
});

export type IGetTopGenericSeriesInput = z.infer<
  typeof zGetTopGenericSeriesInput
> & {
  timezone: string;
};

export const zGetUserJourneyInput = z.object({
  projectId: z.string(),
  filters: z.array(z.any()),
  startDate: z.string(),
  endDate: z.string(),
  steps: z.number().min(2).max(10).default(5),
});

export type IGetUserJourneyInput = z.infer<typeof zGetUserJourneyInput> & {
  timezone: string;
};

export const zGetTopEventsInput = z.object({
  projectId: z.string(),
  filters: z.array(z.any()),
  startDate: z.string(),
  endDate: z.string(),
  excludeEvents: z.array(z.string()).optional(),
});

export type IGetTopEventsInput = z.infer<typeof zGetTopEventsInput> & {
  timezone: string;
};

export const zGetTopLinkOutInput = z.object({
  projectId: z.string(),
  filters: z.array(z.any()),
  startDate: z.string(),
  endDate: z.string(),
});

export type IGetTopLinkOutInput = z.infer<typeof zGetTopLinkOutInput> & {
  timezone: string;
};

export const zGetMapDataInput = z.object({
  projectId: z.string(),
  filters: z.array(z.any()),
  startDate: z.string(),
  endDate: z.string(),
});

export type IGetMapDataInput = z.infer<typeof zGetMapDataInput> & {
  timezone: string;
};

export interface ILiveMinuteCount {
  minute: string;
  sessionCount: number;
  visitorCount: number;
  timestamp: number;
  time: string;
  referrers: Array<{ referrer: string; count: number }>;
}

export interface ILiveData {
  totalSessions: number;
  minuteCounts: ILiveMinuteCount[];
  referrers: Array<{ referrer: string; count: number }>;
}

async function createRevenueQuery(
  deps: ServiceDeps,
  {
    projectId,
    startDate,
    endDate,
    interval,
    timezone,
    filters,
  }: {
    projectId: string;
    startDate: string;
    endDate: string;
    interval: IInterval;
    timezone: string;
    filters: IChartEventFilter[];
  }
): Promise<{ date: string; total_revenue: number }[]> {
  const rows = await runQuery<{ date: string; total_revenue: number }>(
    deps,
    revenueQuery({
      projectId,
      startDate,
      endDate,
      interval,
      rawFilterWhere: getRawWhereClause('events', filters),
    }),
    timezone
  );
  return rows.map((row) => ({
    ...row,
    date: convertClickhouseDateToJs(row.date).toISOString(),
  }));
}

function mergeRevenueIntoSeries<T extends { date: string }>(
  series: T[],
  revenueData: { date: string; total_revenue: number }[]
): (T & { total_revenue: number })[] {
  const revenueByDate = new Map(
    revenueData
      .filter((r) => !isClickhouseDefaultMinDate(r.date))
      .map((r) => [r.date, r.total_revenue])
  );
  return series.map((row) => ({
    ...row,
    total_revenue: revenueByDate.get(row.date) ?? 0,
  }));
}

function getOverallRevenue(
  revenueData: { date: string; total_revenue: number }[]
): number {
  return (
    revenueData.find((r) => isClickhouseDefaultMinDate(r.date))
      ?.total_revenue ?? 0
  );
}

/**
 * V1 `withDistinctSessionsIfNeeded`: a page (`path`) filter has no column on
 * `sessions`, so it's resolved against `events` first and the session ids
 * that match are intersected in. Returns the mutually-exclusive pair every
 * `sessions`-scoped query builder takes.
 */
function sessionsFilterMode(params: {
  filters: IChartEventFilter[];
  projectId: string;
  startDate: string;
  endDate: string;
}): {
  rawFilterWhere: SqlFragment | null;
  distinctSessionsCte: SqlFragment | null;
} {
  if (!isPageFilter(params.filters)) {
    return {
      rawFilterWhere: getRawWhereClause('sessions', params.filters),
      distinctSessionsCte: null,
    };
  }
  return {
    rawFilterWhere: null,
    distinctSessionsCte: distinctSessionsQuery({
      projectId: params.projectId,
      startDate: params.startDate,
      endDate: params.endDate,
      rawFilterWhere: getRawWhereClause('events', params.filters),
    }),
  };
}

export function isPageFilter(filters: IChartEventFilter[]) {
  return filters.some((filter) => filter.name === 'path' && filter.value);
}

export async function getMetrics(
  deps: ServiceDeps,
  {
    projectId,
    filters,
    startDate,
    endDate,
    interval,
    timezone,
  }: IGetMetricsInput
): Promise<{
  metrics: {
    bounce_rate: number;
    unique_visitors: number;
    total_sessions: number;
    avg_session_duration: number;
    total_screen_views: number;
    views_per_session: number;
    total_revenue: number;
  };
  series: {
    date: string;
    bounce_rate: number;
    unique_visitors: number;
    total_sessions: number;
    avg_session_duration: number;
    total_screen_views: number;
    views_per_session: number;
    total_revenue: number;
  }[];
}> {
  return isPageFilter(filters)
    ? getMetricsWithPageFilter(deps, {
        projectId,
        filters,
        startDate,
        endDate,
        interval,
        timezone,
      })
    : getMetricsFromSessions(deps, {
        projectId,
        filters,
        startDate,
        endDate,
        interval,
        timezone,
      });
}

async function getMetricsFromSessions(
  deps: ServiceDeps,
  {
    projectId,
    filters,
    startDate,
    endDate,
    interval,
    timezone,
  }: IGetMetricsInput
): Promise<{
  metrics: MetricsRow & { total_revenue: number };
  series: MetricsSeriesRow[];
}> {
  const [sessionRes, revenueRes] = await Promise.all([
    runQuery<{
      date: string;
      bounce_rate: number;
      unique_visitors: number;
      total_sessions: number;
      avg_session_duration: number;
      total_screen_views: number;
      views_per_session: number;
    }>(
      deps,
      sessionMetricsQuery({
        projectId,
        startDate,
        endDate,
        interval,
        rawFilterWhere: getRawWhereClause('sessions', filters),
      }),
      timezone
    ).then((rows) =>
      rows.map((row) => ({ ...row, date: new Date(row.date).toISOString() }))
    ),
    createRevenueQuery(deps, {
      projectId,
      startDate,
      endDate,
      interval,
      timezone,
      filters,
    }),
  ]);

  const overallRevenue = getOverallRevenue(revenueRes);
  const series = mergeRevenueIntoSeries(sessionRes.slice(1), revenueRes);

  return {
    metrics: {
      bounce_rate: sessionRes[0]?.bounce_rate ?? 0,
      unique_visitors: sessionRes[0]?.unique_visitors ?? 0,
      total_sessions: sessionRes[0]?.total_sessions ?? 0,
      avg_session_duration: sessionRes[0]?.avg_session_duration ?? 0,
      total_screen_views: sessionRes[0]?.total_screen_views ?? 0,
      views_per_session: sessionRes[0]?.views_per_session ?? 0,
      total_revenue: overallRevenue,
    },
    series,
  };
}

async function getMetricsWithPageFilter(
  deps: ServiceDeps,
  {
    projectId,
    filters,
    startDate,
    endDate,
    interval,
    timezone,
  }: IGetMetricsInput
): Promise<{
  metrics: MetricsRow & { total_revenue: number };
  series: MetricsSeriesRow[];
}> {
  const rawEventFilterWhere = getRawWhereClause('events', filters);
  const rawSessionFilterWhere = getRawWhereClause('sessions', filters);

  const [mainRes, revenueRes] = await Promise.all([
    runQuery<{
      date: string;
      bounce_rate: number;
      unique_visitors: number;
      total_sessions: number;
      avg_session_duration: number;
      total_screen_views: number;
      views_per_session: number;
      overall_unique_visitors: number;
      overall_total_sessions: number;
      overall_bounce_rate: number;
    }>(
      deps,
      metricsWithPageFilterQuery({
        projectId,
        startDate,
        endDate,
        interval,
        rawSessionFilterWhere,
        rawEventFilterWhere,
      }),
      timezone
    ).then((rows) =>
      rows.map((row) => ({ ...row, date: new Date(row.date).toISOString() }))
    ),
    createRevenueQuery(deps, {
      projectId,
      startDate,
      endDate,
      interval,
      timezone,
      filters,
    }),
  ]);

  const overallRevenue = getOverallRevenue(revenueRes);
  const series = mergeRevenueIntoSeries(mainRes, revenueRes);

  const anyRowWithData = mainRes.find(
    (item) =>
      item.overall_bounce_rate !== null ||
      item.overall_total_sessions !== null ||
      item.overall_unique_visitors !== null
  );

  return {
    metrics: {
      bounce_rate: anyRowWithData?.overall_bounce_rate ?? 0,
      unique_visitors: anyRowWithData?.overall_unique_visitors ?? 0,
      total_sessions: anyRowWithData?.overall_total_sessions ?? 0,
      avg_session_duration: average(
        mainRes.map((item) => item.avg_session_duration)
      ),
      total_screen_views: sum(mainRes.map((item) => item.total_screen_views)),
      views_per_session: average(mainRes.map((item) => item.views_per_session)),
      total_revenue: overallRevenue,
    },
    series,
  };
}

export function getRawWhereClause(
  type: 'events' | 'sessions',
  filters: IChartEventFilter[]
): SqlFragment | null {
  const where = getEventFiltersWhereClause(
    filters.flatMap((item) => {
      if (!WHITELISTED_FILTERS.includes(item.name)) {
        return [];
      }
      if (type === 'sessions') {
        if (item.name === 'path') {
          return [{ ...item, name: 'entry_path' }];
        }
        if (item.name === 'origin') {
          return [{ ...item, name: 'entry_origin' }];
        }
        if (item.name.startsWith('properties.__query.utm_')) {
          return [
            {
              ...item,
              name: item.name.replace('properties.__query.utm_', 'utm_'),
            },
          ];
        }
        // sessions table has no `properties` map for arbitrary keys —
        // drop them instead of generating an invalid WHERE clause.
        if (item.name.startsWith('properties.')) {
          return [];
        }
        return [item];
      }
      // events table has no top-level utm_* columns — those live in the
      // properties map under the __query.utm_* keys. Route them through
      // getEventFiltersWhereClause's properties.* path so we emit
      // `properties['__query.utm_source']` instead of the bare column.
      if (UTM_COLUMNS.includes(item.name)) {
        return [{ ...item, name: `properties.__query.${item.name}` }];
      }
      return [item];
    }),
    undefined,
    undefined,
    type
  );

  return joinFilterClauses(where);
}

export async function getTopPages(
  deps: ServiceDeps,
  { projectId, filters, startDate, endDate, timezone, limit }: IGetTopPagesInput
) {
  return runQuery<{
    origin: string;
    path: string;
    sessions: number;
    pageviews: number;
    revenue?: number;
  }>(
    deps,
    topPagesQuery({
      projectId,
      startDate,
      endDate,
      rawFilterWhere: getRawWhereClause('events', filters),
      limit: Math.min(limit ?? MAX_RECORDS_LIMIT, MAX_RECORDS_LIMIT),
    }),
    timezone
  );
}

export async function getTopEntryExit(
  deps: ServiceDeps,
  {
    projectId,
    filters,
    startDate,
    endDate,
    mode,
    timezone,
    limit,
  }: IGetTopEntryExitInput
) {
  const sessionsFilter = sessionsFilterMode({
    filters,
    projectId,
    startDate,
    endDate,
  });
  return runQuery<{
    origin: string;
    path: string;
    sessions: number;
    pageviews: number;
    revenue?: number;
  }>(
    deps,
    topEntryExitQuery({
      projectId,
      startDate,
      endDate,
      mode,
      limit: Math.min(limit ?? MAX_RECORDS_LIMIT, MAX_RECORDS_LIMIT),
      rawFilterWhere: sessionsFilter.rawFilterWhere,
      distinctSessionsCte: sessionsFilter.distinctSessionsCte,
    }),
    timezone
  );
}

export async function getTopGeneric(
  deps: ServiceDeps,
  {
    projectId,
    filters,
    startDate,
    endDate,
    column,
    timezone,
  }: IGetTopGenericInput
) {
  if (!WHITELISTED_FILTERS.includes(column)) {
    return [];
  }

  const prefixColumn = COLUMN_PREFIX_MAP[column] ?? null;
  const sessionsFilter = sessionsFilterMode({
    filters,
    projectId,
    startDate,
    endDate,
  });

  return runQuery<{
    prefix?: string;
    name: string;
    sessions: number;
    pageviews: number;
    revenue?: number;
  }>(
    deps,
    topGenericQuery({
      projectId,
      startDate,
      endDate,
      column,
      prefixColumn,
      limit: MAX_RECORDS_LIMIT,
      rawFilterWhere: sessionsFilter.rawFilterWhere,
      distinctSessionsCte: sessionsFilter.distinctSessionsCte,
    }),
    timezone
  );
}

export async function getTopGenericSeries(
  deps: ServiceDeps,
  {
    projectId,
    filters,
    startDate,
    endDate,
    column,
    interval,
    timezone,
  }: IGetTopGenericSeriesInput
): Promise<{
  items: Array<{
    name: string;
    prefix?: string;
    data: Array<{
      date: string;
      sessions: number;
      pageviews: number;
      revenue?: number;
    }>;
    total: { sessions: number; pageviews: number; revenue?: number };
  }>;
}> {
  const prefixColumn = COLUMN_PREFIX_MAP[column] ?? null;
  const TOP_LIMIT = 500;

  const topItemsSessionsFilter = sessionsFilterMode({
    filters,
    projectId,
    startDate,
    endDate,
  });

  const topItems = await runQuery<{
    prefix?: string;
    name: string;
    sessions: number;
    pageviews: number;
    revenue?: number;
  }>(
    deps,
    topGenericSeriesTopItemsQuery({
      projectId,
      startDate,
      endDate,
      column,
      prefixColumn,
      limit: TOP_LIMIT,
      rawFilterWhere: topItemsSessionsFilter.rawFilterWhere,
      distinctSessionsCte: topItemsSessionsFilter.distinctSessionsCte,
    }),
    timezone
  );

  if (topItems.length === 0) {
    return { items: [] };
  }

  // V1 always applies the sessions rawWhere here (unlike the top-items
  // query above), additionally wrapping in distinct_sessions on a page
  // filter — see overview.sql.ts's topGenericSeriesTimeSeriesQuery header.
  const timeSeriesSessionsFilter = isPageFilter(filters)
    ? distinctSessionsQuery({
        projectId,
        startDate,
        endDate,
        rawFilterWhere: getRawWhereClause('events', filters),
      })
    : null;

  const timeSeriesData = await runQuery<{
    date: string;
    prefix?: string;
    name: string;
    sessions: number;
    pageviews: number;
    revenue?: number;
  }>(
    deps,
    topGenericSeriesTimeSeriesQuery({
      projectId,
      startDate,
      endDate,
      interval,
      column,
      prefixColumn,
      rawFilterWhere: getRawWhereClause('sessions', filters),
      distinctSessionsCte: timeSeriesSessionsFilter,
    }),
    timezone
  ).then((rows) =>
    rows.map((row) => ({ ...row, date: new Date(row.date).toISOString() }))
  );

  const itemsMap = new Map<
    string,
    {
      name: string;
      prefix?: string;
      data: Array<{
        date: string;
        sessions: number;
        pageviews: number;
        revenue?: number;
      }>;
      total: { sessions: number; pageviews: number; revenue?: number };
    }
  >();

  for (const item of topItems) {
    const key = `${item.prefix || ''}:${item.name}`;
    itemsMap.set(key, {
      name: item.name,
      prefix: item.prefix,
      data: [],
      total: {
        sessions: item.sessions,
        pageviews: item.pageviews,
        revenue: item.revenue ?? 0,
      },
    });
  }

  for (const row of timeSeriesData) {
    const key = `${row.prefix || ''}:${row.name}`;
    const item = itemsMap.get(key);
    if (item) {
      item.data.push({
        date: row.date,
        sessions: row.sessions,
        pageviews: row.pageviews,
        revenue: row.revenue,
      });
    }
  }

  return {
    items: Array.from(itemsMap.values()),
  };
}

export async function getUserJourney(
  deps: ServiceDeps,
  {
    projectId,
    filters,
    startDate,
    endDate,
    steps = 5,
    timezone,
  }: IGetUserJourneyInput
): Promise<{
  nodes: Array<{
    id: string;
    label: string;
    nodeColor: string;
    percentage?: number;
    value?: number;
    step?: number;
  }>;
  links: Array<{ source: string; target: string; value: number }>;
}> {
  // Config
  const TOP_ENTRIES = 3; // Only show top 3 entry pages
  const TOP_DESTINATIONS_PER_NODE = 3; // Top 3 destinations from each node

  // Color palette - each entry page gets a consistent color
  const COLORS = chartColors.map((color) => color.main);

  const rawFilterWhere = getRawWhereClause('events', filters);
  const orderedEventsInput = { projectId, startDate, endDate, rawFilterWhere };

  const topEntries = await runQuery<{ entry_page: string; count: number }>(
    deps,
    topEntriesQuery({ ...orderedEventsInput, steps, topEntries: TOP_ENTRIES }),
    timezone
  );

  if (topEntries.length === 0) {
    return { nodes: [], links: [] };
  }

  const topEntryPages = topEntries.map((e) => e.entry_page);
  const totalSessions = topEntries.reduce((total, e) => total + e.count, 0);

  const transitions = await runQuery<{
    source: string;
    target: string;
    step: number;
    value: number;
  }>(
    deps,
    transitionsQuery({ ...orderedEventsInput, steps, topEntryPages }),
    timezone
  );

  if (transitions.length === 0) {
    return { nodes: [], links: [] };
  }

  // Build the sankey progressively step by step. Start with entry nodes,
  // then follow top destinations at each step. Node IDs combine path with
  // step to prevent circular references.
  const nodes = new Map<
    string,
    { path: string; value: number; step: number; color: string }
  >();
  const links: Array<{ source: string; target: string; value: number }> = [];

  const getNodeId = (path: string, step: number) => `${path}::step${step}`;

  const transitionsByStep = new Map<number, typeof transitions>();
  for (const t of transitions) {
    if (!transitionsByStep.has(t.step)) {
      transitionsByStep.set(t.step, []);
    }
    transitionsByStep.get(t.step)!.push(t);
  }

  const activeNodes = new Map<string, string>(); // path -> nodeId
  topEntries.forEach((entry, idx) => {
    const nodeId = getNodeId(entry.entry_page, 1);
    nodes.set(nodeId, {
      path: entry.entry_page,
      value: entry.count,
      step: 1,
      color: COLORS[idx % COLORS.length]!,
    });
    activeNodes.set(entry.entry_page, nodeId);
  });

  for (let step = 1; step < steps; step++) {
    const stepTransitions = transitionsByStep.get(step) || [];
    const nextActiveNodes = new Map<string, string>();

    for (const [sourcePath, sourceNodeId] of activeNodes) {
      const fromSource = stepTransitions
        .filter((t) => t.source === sourcePath)
        .sort((a, b) => b.value - a.value)
        .slice(0, TOP_DESTINATIONS_PER_NODE);

      for (const t of fromSource) {
        if (t.source === t.target) {
          continue;
        }

        const targetNodeId = getNodeId(t.target, step + 1);

        links.push({
          source: sourceNodeId,
          target: targetNodeId,
          value: t.value,
        });

        const existing = nodes.get(targetNodeId);
        if (existing) {
          existing.value += t.value;
        } else {
          const sourceData = nodes.get(sourceNodeId);
          nodes.set(targetNodeId, {
            path: t.target,
            value: t.value,
            step: step + 1,
            color: sourceData?.color || COLORS[nodes.size % COLORS.length]!,
          });
        }

        nextActiveNodes.set(t.target, targetNodeId);
      }
    }

    activeNodes.clear();
    for (const [path, nodeId] of nextActiveNodes) {
      activeNodes.set(path, nodeId);
    }

    if (activeNodes.size === 0) {
      break;
    }
  }

  // Filter links by threshold (0.25% of total sessions)
  const MIN_LINK_PERCENT = 0.25;
  const minLinkValue = Math.ceil((totalSessions * MIN_LINK_PERCENT) / 100);
  const filteredLinks = links.filter((link) => link.value >= minLinkValue);

  const referencedNodeIds = new Set<string>();
  filteredLinks.forEach((link) => {
    referencedNodeIds.add(link.source);
    referencedNodeIds.add(link.target);
  });

  const nodeValuesFromLinks = new Map<string, number>();
  filteredLinks.forEach((link) => {
    const current = nodeValuesFromLinks.get(link.target) || 0;
    nodeValuesFromLinks.set(link.target, current + link.value);
  });

  // For entry nodes (step 1), only keep them if they have outgoing links after filtering
  nodes.forEach((nodeData, nodeId) => {
    if (nodeData.step === 1) {
      const hasOutgoing = filteredLinks.some((l) => l.source === nodeId);
      if (!hasOutgoing) {
        referencedNodeIds.delete(nodeId);
      }
    }
  });

  const finalNodes = Array.from(nodes.entries())
    .filter(([id]) => referencedNodeIds.has(id))
    .map(([id, data]) => {
      const value =
        data.step === 1
          ? data.value
          : nodeValuesFromLinks.get(id) || data.value;
      return {
        id,
        label: data.path,
        nodeColor: data.color,
        percentage: (value / totalSessions) * 100,
        value,
        step: data.step,
      };
    })
    .sort((a, b) => {
      if (a.step !== b.step) {
        return a.step - b.step;
      }
      return b.value - a.value;
    });

  const nodeIds = new Set(finalNodes.map((n) => n.id));
  const invalidLinks = filteredLinks.filter(
    (link) => !(nodeIds.has(link.source) && nodeIds.has(link.target))
  );
  if (invalidLinks.length > 0) {
    console.warn(
      `UserJourney: Found ${invalidLinks.length} links with missing nodes`
    );
    const validLinks = filteredLinks.filter(
      (link) => nodeIds.has(link.source) && nodeIds.has(link.target)
    );
    return {
      nodes: finalNodes,
      links: validLinks,
    };
  }

  const stepsValid = finalNodes.every((node, idx, arr) => {
    if (idx === 0) {
      return true;
    }
    return node.step! >= arr[idx - 1]!.step!;
  });
  if (!stepsValid) {
    console.warn('UserJourney: Steps are not monotonic');
  }

  return {
    nodes: finalNodes,
    links: filteredLinks,
  };
}

export async function getTopEvents(
  deps: ServiceDeps,
  {
    projectId,
    filters,
    startDate,
    endDate,
    timezone,
    excludeEvents = ['session_start', 'session_end', 'screen_view'],
  }: {
    projectId: string;
    filters: IChartEventFilter[];
    startDate: string;
    endDate: string;
    timezone: string;
    excludeEvents?: string[];
  }
): Promise<Array<{ name: string; count: number }>> {
  return runQuery<{ name: string; count: number }>(
    deps,
    topEventsQuery({
      projectId,
      startDate,
      endDate,
      rawFilterWhere: getRawWhereClause('events', filters),
      excludeEvents,
    }),
    timezone
  );
}

export async function getTopLinkOut(
  deps: ServiceDeps,
  {
    projectId,
    filters,
    startDate,
    endDate,
    timezone,
  }: {
    projectId: string;
    filters: IChartEventFilter[];
    startDate: string;
    endDate: string;
    timezone: string;
  }
): Promise<Array<{ href: string; count: number }>> {
  return runQuery<{ href: string; count: number }>(
    deps,
    topLinkOutQuery({
      projectId,
      startDate,
      endDate,
      rawFilterWhere: getRawWhereClause('events', filters),
    }),
    timezone
  );
}

export async function getMapData(
  deps: ServiceDeps,
  {
    projectId,
    filters,
    startDate,
    endDate,
    timezone,
  }: {
    projectId: string;
    filters: IChartEventFilter[];
    startDate: string;
    endDate: string;
    timezone: string;
  }
): Promise<
  Array<{
    country: string;
    region?: string;
    city?: string;
    lat: number;
    lng: number;
    count: number;
  }>
> {
  const results = await runQuery<{
    country: string;
    region: string | null;
    city: string | null;
    count: number;
  }>(
    deps,
    mapDataQuery({
      projectId,
      startDate,
      endDate,
      rawFilterWhere: getRawWhereClause('events', filters),
    }),
    timezone
  );

  // Placeholder lat/lng — geocoding is unresolved, same as V1.
  return results.map((row) => ({
    country: row.country,
    region: row.region ?? undefined,
    city: row.city ?? undefined,
    lat: 0,
    lng: 0,
    count: row.count,
  }));
}

/** The dashboard's live/30-minute-window widget — moved from packages/trpc's overview router (M7-005). */
export async function getLiveData(
  deps: ServiceDeps,
  projectId: string
): Promise<ILiveData> {
  const [totalSessions, minuteCounts, minuteReferrers, referrers] =
    await Promise.all([
      runQuery<{ total_sessions: number }>(
        deps,
        liveTotalSessionsQuery({ projectId }),
        'UTC'
      ),
      runQuery<{
        minute: string;
        session_count: number;
        visitor_count: number;
      }>(deps, liveMinuteCountsQuery({ projectId }), 'UTC'),
      runQuery<{ minute: string; referrer_name: string; count: number }>(
        deps,
        liveMinuteReferrersQuery({ projectId }),
        'UTC'
      ),
      runQuery<{ referrer: string; count: number }>(
        deps,
        liveReferrersQuery({ projectId }),
        'UTC'
      ),
    ]);

  const referrersByMinute = new Map<
    string,
    Array<{ referrer: string; count: number }>
  >();
  for (const item of minuteReferrers) {
    if (!referrersByMinute.has(item.minute)) {
      referrersByMinute.set(item.minute, []);
    }
    referrersByMinute.get(item.minute)!.push({
      referrer: item.referrer_name,
      count: item.count,
    });
  }

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
}

export type TrafficColumn =
  | 'referrer'
  | 'referrer_name'
  | 'referrer_type'
  | 'utm_source'
  | 'utm_medium'
  | 'utm_campaign'
  | 'country'
  | 'region'
  | 'city'
  | 'device'
  | 'browser'
  | 'os';

export async function getTrafficBreakdownCore(
  deps: ServiceDeps,
  input: {
    projectId: string;
    startDate: string;
    endDate: string;
    column: TrafficColumn;
    filters?: IChartEventFilter[];
  }
) {
  const { timezone } = await getSettingsForProject(deps, input.projectId);
  return getTopGeneric(deps, {
    projectId: input.projectId,
    filters: input.filters ?? [],
    startDate: input.startDate,
    endDate: input.endDate,
    column: input.column,
    timezone,
  });
}

// Columns whose daily series we can derive from the sessions table. Page/entry
// insights (path/origin) live on the events table and aren't covered here — the
// caller degrades to no series for those.
const SEGMENT_SERIES_COLUMNS: ReadonlySet<string> = new Set<TrafficColumn>([
  'referrer',
  'referrer_name',
  'referrer_type',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'country',
  'region',
  'city',
  'device',
  'browser',
  'os',
]);

export interface SegmentDailyPoint {
  date: string;
  sessions: number;
  pageviews: number;
}

// Daily breakdown for a single segment value (e.g. the "Twitter" referrer),
// so the explainer can see the *shape* of a change (one-off spike vs sustained
// growth) instead of only current-vs-baseline totals. Returns one point per day
// with zero-filled gaps; empty when the column isn't session-derived or the
// value never appears in the window.
export async function getSegmentDailySeriesCore(
  deps: ServiceDeps,
  input: {
    projectId: string;
    column: string;
    value: string;
    startDate: string;
    endDate: string;
  }
): Promise<SegmentDailyPoint[]> {
  if (!SEGMENT_SERIES_COLUMNS.has(input.column)) {
    return [];
  }

  const { timezone } = await getSettingsForProject(deps, input.projectId);
  const { items } = await getTopGenericSeries(deps, {
    projectId: input.projectId,
    filters: [],
    startDate: input.startDate,
    endDate: input.endDate,
    column: input.column as TrafficColumn,
    interval: 'day',
    timezone,
  });

  // getTopGenericSeries reports empty values as null name; insights store the
  // empty referrer as "direct". Match the segment leniently.
  const target = input.value.toLowerCase();
  const matched = items.find((item) => {
    const name = (item.name ?? '').toLowerCase();
    return name === target || (name === '' && target === 'direct');
  });

  return (matched?.data ?? []).map((point) => ({
    date: point.date,
    sessions: Number(point.sessions ?? 0),
    pageviews: Number(point.pageviews ?? 0),
  }));
}

export interface GetAnalyticsOverviewInput {
  projectId: string;
  startDate: string;
  endDate: string;
  interval?: 'hour' | 'day' | 'week' | 'month';
  filters?: IChartEventFilter[];
}

export async function getAnalyticsOverviewCore(
  deps: ServiceDeps,
  input: GetAnalyticsOverviewInput
) {
  const { timezone } = await getSettingsForProject(deps, input.projectId);
  const interval = input.interval ?? 'day';

  const result = await getMetrics(deps, {
    projectId: input.projectId,
    filters: input.filters ?? [],
    startDate: input.startDate,
    endDate: input.endDate,
    interval,
    timezone,
  });

  return {
    summary: result.metrics,
    series: result.series,
    interval,
    startDate: input.startDate,
    endDate: input.endDate,
  };
}

export interface OverviewService {
  isPageFilter(filters: IChartEventFilter[]): boolean;
  getRawWhereClause(
    type: 'events' | 'sessions',
    filters: IChartEventFilter[]
  ): SqlFragment | null;
  getMetrics(input: IGetMetricsInput): ReturnType<typeof getMetrics>;
  getTopPages(input: IGetTopPagesInput): ReturnType<typeof getTopPages>;
  getTopEntryExit(
    input: IGetTopEntryExitInput
  ): ReturnType<typeof getTopEntryExit>;
  getTopGeneric(input: IGetTopGenericInput): ReturnType<typeof getTopGeneric>;
  getTopGenericSeries(
    input: IGetTopGenericSeriesInput
  ): ReturnType<typeof getTopGenericSeries>;
  getUserJourney(
    input: IGetUserJourneyInput
  ): ReturnType<typeof getUserJourney>;
  getTopEvents(
    input: Parameters<typeof getTopEvents>[1]
  ): ReturnType<typeof getTopEvents>;
  getTopLinkOut(
    input: Parameters<typeof getTopLinkOut>[1]
  ): ReturnType<typeof getTopLinkOut>;
  getMapData(
    input: Parameters<typeof getMapData>[1]
  ): ReturnType<typeof getMapData>;
  getLiveData(projectId: string): Promise<ILiveData>;
  getTrafficBreakdownCore(
    input: Parameters<typeof getTrafficBreakdownCore>[1]
  ): ReturnType<typeof getTrafficBreakdownCore>;
  getSegmentDailySeriesCore(
    input: Parameters<typeof getSegmentDailySeriesCore>[1]
  ): Promise<SegmentDailyPoint[]>;
  getAnalyticsOverviewCore(
    input: GetAnalyticsOverviewInput
  ): ReturnType<typeof getAnalyticsOverviewCore>;
}

export function createOverviewService(
  deps: ServiceDeps,
  _services: () => Services
): OverviewService {
  return {
    isPageFilter,
    getRawWhereClause,
    getMetrics: (input) => getMetrics(deps, input),
    getTopPages: (input) => getTopPages(deps, input),
    getTopEntryExit: (input) => getTopEntryExit(deps, input),
    getTopGeneric: (input) => getTopGeneric(deps, input),
    getTopGenericSeries: (input) => getTopGenericSeries(deps, input),
    getUserJourney: (input) => getUserJourney(deps, input),
    getTopEvents: (input) => getTopEvents(deps, input),
    getTopLinkOut: (input) => getTopLinkOut(deps, input),
    getMapData: (input) => getMapData(deps, input),
    getLiveData: (projectId) => getLiveData(deps, projectId),
    getTrafficBreakdownCore: (input) => getTrafficBreakdownCore(deps, input),
    getSegmentDailySeriesCore: (input) =>
      getSegmentDailySeriesCore(deps, input),
    getAnalyticsOverviewCore: (input) => getAnalyticsOverviewCore(deps, input),
  };
}
