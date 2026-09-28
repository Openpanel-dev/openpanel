// Every ClickHouse statement this module runs is a `sql` fragment from
// src/sql.ts. Funnel, conversion, sankey and retention are dispatched to the
// sibling `*.service.ts` files. The one thing still value-imported from
// `@openpanel/db` under `./src/` is the `sql` tag, which stays in
// `packages/db` by name: a compile-time template tag, no client and no
// request scope.

import { getChartPrevStartEndDate } from '@openpanel/shared';
import { flatten, map, pipe, prop, sort, uniq } from 'ramda';
import type { ServiceDeps, Services } from '../../services';
import { getEventMetasCached } from '../event/event.service';
import { getSettingsForProject } from '../organization/organization.service';
import {
  getProfilePropertyKeysCached,
  getProfilesCached,
  type IServiceProfile,
} from '../profile/profile.service';
import type {
  FinalChart,
  IChartEventFilter,
  IChartRange,
  IChartSeries,
  ICriteria,
  IInterval,
  IReportInput,
} from '../report/report.constants';
import type { IServiceReport } from '../report/report.service';
import { getChartStartEndDate } from '../report/src/chart-dates';
import { mergeGlobalFilters, onlyReportEvents } from '../report/src/series';
import { createConversionService, getConversion } from './conversion.service';
import {
  createFunnelService,
  getFunnel,
  getFunnelProfileIds,
} from './funnel.service';
import {
  createRetentionService,
  getRetentionCohort,
} from './retention.service';
import {
  assertSankeyWindowIsAnswerable,
  createSankeyService,
  getSankey,
} from './sankey.service';
import { mapWithConcurrency } from './src/concurrency';
import { formatClickhouseDate } from './src/dates';
import { executeAggregateChart, executeChart } from './src/engine/execute';
import {
  getGroupPropertySelect,
  getProfilePropertySelect,
  getSelectPropertyKey,
  isKnownEventField,
  normalizeEventField,
} from './src/field-resolution';
import { eventFieldValuesQuery } from './src/field-values.sql';
import { runQuery } from './src/run-query';
import {
  chartBucketProfilesQuery,
  eventNamesWithCountQuery,
  eventPropertyKeysQuery,
  eventPropertyValuesQuery,
  groupPropertyValuesQuery,
  profilePropertyValuesQuery,
  projectCardChartQuery,
  projectCardMetricsQuery,
} from './src/sql';

export { rewriteProfilePropertyRefs } from './src/compiled';
export { executeAggregateChart, executeChart } from './src/engine/execute';
export {
  evaluateFormula,
  InvalidFormulaError,
  isValidFormula,
} from './src/engine/formula';
export type {
  ConcreteSeries,
  Plan,
  SeriesDefinition,
} from './src/engine/types';
export {
  buildAllCohortsLabelExpr,
  buildAllCohortsMembershipQuery,
  buildCohortMembershipQuery,
  buildInlineCohortJoin,
  CHART_TABLE,
  type CohortMetadata,
  collectBreakdownCohortIds,
  collectProfilePropertyKeys,
  EVENT_FIELD_ALIASES,
  EVENT_TOP_LEVEL_COLUMNS,
  extractCohortId,
  getCohortAlias,
  getCohortCteName,
  getGroupPropertySelect,
  getGroupPropertySql,
  getProfilePropertySelect,
  getSelectPropertyKey,
  isAllCohortsBreakdown,
  isKnownEventField,
  isNumericColumn,
  normalizeEventField,
  profilePropertiesCteSelect,
  transformPropertyKey,
} from './src/field-resolution';
export {
  type FilterTableScope,
  getEventFiltersWhereClause,
} from './src/filter-where';
export {
  type ChartBucketProfilesInput,
  ChartCohortIdError,
} from './src/sql';
// Types only: `packages/core/src/index.ts` re-exports these two. The four
// statement functions beside them had no consumer through this file — the
// engine and the sibling services import ./src/statement directly.
export type {
  AggregateChartSqlInput,
  ChartSqlInput,
} from './src/statement';

/**
 * Cap on distinct event property keys returned to the picker. Projects in the
 * 8k range exist, so the previous 10k was reachable in normal use.
 */
const EVENT_PROPERTY_KEY_LIMIT = 50_000;

/**
 * Cap on distinct values returned per event property to the filter
 * autocomplete. High-cardinality keys (ids, urls, session tokens) can hold
 * millions of distinct values — most recent values win. Env-tunable via
 * EVENT_PROPERTY_VALUE_AUTOCOMPLETE_LIMIT (positive integer; invalid values
 * keep the default).
 */
const DEFAULT_EVENT_PROPERTY_VALUE_AUTOCOMPLETE_LIMIT = 500;

/** Profile lookups are batched so the `IN (...)` never exceeds max_query_size. */
const BUCKET_PROFILES_BATCH_SIZE = 200;

/**
 * In-flight `profiles FINAL` batches. Issuing every batch at once would replace
 * a latency problem with a ClickHouse admission-queue one on a 4-core node.
 * Four keeps the node's `max_threads = 4` worth of work busy without queueing.
 */
const BUCKET_PROFILES_FETCH_CONCURRENCY = 4;

/**
 * Cap on the ids one chart data point hands the drill-down modal. The bucket
 * query used to be unbounded, so a busy project's point returned a 31,447-id
 * tail that the modal renders
 * through a virtualizer and nobody scrolls to, after paying for every one of
 * them in `profiles FINAL` batches. Same number as FUNNEL_PROFILES_LIMIT: both
 * feed the same modal, so the two drill-downs should not disagree on depth.
 */
const BUCKET_PROFILES_LIMIT = 1000;

const FUNNEL_PROFILES_BATCH_SIZE = 500;
const FUNNEL_PROFILES_LIMIT = 1000;

const FIXED_FILTER_PROPERTIES = [
  'revenue',
  'has_profile',
  'path',
  'origin',
  'referrer',
  'referrer_name',
  'created_at',
  'country',
  'city',
  'region',
  'os',
  'os_version',
  'browser',
  'browser_version',
  'device',
  'brand',
  'model',
  'profile.id',
  'profile.first_name',
  'profile.last_name',
  'profile.email',
  'profile.created_at',
  'profile.last_seen_at',
];

async function getProfilesInBatches(
  deps: ServiceDeps,
  ids: string[],
  projectId: string,
  batchSize: number
): Promise<IServiceProfile[]> {
  const batches: string[][] = [];
  for (let index = 0; index < ids.length; index += batchSize) {
    batches.push(ids.slice(index, index + batchSize));
  }
  // mapWithConcurrency resolves in batch order, so the caller still sees the
  // profiles in the order the bucket query returned their ids.
  const perBatch = await mapWithConcurrency(
    batches,
    BUCKET_PROFILES_FETCH_CONCURRENCY,
    (batch) => getProfilesCached(deps, batch, projectId)
  );
  return perBatch.flat();
}

// --- shared report input -----------------------------------------------------

export type ShareableReportInput = IReportInput & {
  shareId?: string;
  id?: string;
};

/**
 * A shared report is rendered from its saved definition; the caller may only
 * move the date window.
 */
export function resolveReportInput(
  report: NonNullable<IServiceReport> | null,
  input: ShareableReportInput
): IReportInput {
  if (!report) {
    return input;
  }
  return {
    ...report,
    range: input.range ?? report.range,
    startDate: input.startDate ?? report.startDate,
    endDate: input.endDate ?? report.endDate,
    interval: input.interval ?? report.interval,
  };
}

// --- projectCard -------------------------------------------------------------

export interface ProjectCardChartRow {
  value: number;
  date: Date;
  revenue: number;
}
export interface ProjectCardMetrics {
  months_3: number;
  months_3_prev: number;
  month: number;
  day: number;
  day_prev: number;
  revenue: number;
}
export type ProjectCardTrend =
  | { direction: 'neutral'; percentage: number | null }
  | { direction: 'up' | 'down'; percentage: number };

function projectCardTrend(
  metrics: ProjectCardMetrics | undefined
): ProjectCardTrend {
  const change =
    metrics && metrics.months_3_prev > 0 && metrics.months_3 > 0
      ? Math.round(
          ((metrics.months_3 - metrics.months_3_prev) / metrics.months_3_prev) *
            100
        )
      : null;
  if (change === null) {
    return { direction: 'neutral', percentage: null };
  }
  if (change > 0) {
    return { direction: 'up', percentage: change };
  }
  if (change < 0) {
    return { direction: 'down', percentage: Math.abs(change) };
  }
  return { direction: 'neutral', percentage: 0 };
}

export async function getProjectCard(
  deps: ServiceDeps,
  projectId: string
): Promise<{
  chart: ProjectCardChartRow[];
  metrics: ProjectCardMetrics | undefined;
  trend: ProjectCardTrend;
}> {
  const { timezone } = await getSettingsForProject(deps, projectId);
  const [chart, [metrics]] = await Promise.all([
    runQuery<ProjectCardChartRow>(
      deps,
      projectCardChartQuery(projectId),
      timezone
    ),
    runQuery<ProjectCardMetrics>(
      deps,
      projectCardMetricsQuery(projectId),
      timezone
    ),
  ]);

  return {
    chart: chart.map((row) => ({ ...row, date: new Date(row.date) })),
    metrics,
    trend: projectCardTrend(metrics),
  };
}

// --- events / properties / values -------------------------------------------

export interface ChartEventOption {
  name: string;
  count: number;
  meta: Awaited<ReturnType<typeof getEventMetasCached>>[number] | undefined;
}

export async function listChartEvents(
  deps: ServiceDeps,
  projectId: string
): Promise<ChartEventOption[]> {
  const [events, meta] = await Promise.all([
    runQuery<{ name: string; count: number }>(
      deps,
      eventNamesWithCountQuery(projectId)
    ),
    getEventMetasCached(deps, projectId),
  ]);

  return [
    {
      name: '*',
      count: events.reduce((total, event) => total + event.count, 0),
      meta: undefined,
    },
    ...events.map((event) => ({
      name: event.name,
      count: event.count,
      meta: meta.find((item) => item.name === event.name),
    })),
  ];
}

/** `items.0.price` -> `items[*].price`, so a picker entry covers every index. */
function toWildcardPropertyKey(key: string): string {
  return key.replace(/\.([0-9]+)\./g, '.*.').replace(/\.([0-9]+)/g, '[*]');
}

export async function listChartProperties(
  deps: ServiceDeps,
  input: {
    projectId: string;
    event?: string;
  }
): Promise<string[]> {
  const { projectId, event } = input;
  const [profileKeys, eventKeys] = await Promise.all([
    getProfilePropertyKeysCached(deps, projectId),
    runQuery<{ property_key: string; created_at: string }>(
      deps,
      eventPropertyKeysQuery(projectId, event, EVENT_PROPERTY_KEY_LIMIT)
    ),
  ]);

  const properties = [
    ...eventKeys.map(
      (item) => `properties.${toWildcardPropertyKey(item.property_key)}`
    ),
    ...(event === '*' || !event ? ['name'] : []),
    ...FIXED_FILTER_PROPERTIES,
    ...profileKeys.map((key) => `profile.properties.${key}`),
  ];

  return pipe(
    sort<string>((a, b) => a.length - b.length),
    uniq
  )(properties);
}

function nonEmptyValues(rows: { values: string }[]): string[] {
  return rows.map((row) => String(row.values)).filter(Boolean);
}

export async function getChartPropertyValues(
  deps: ServiceDeps,
  input: {
    projectId: string;
    event: string;
    property: string;
  }
): Promise<{ values: string[] }> {
  const { projectId, event, property } = input;

  if (property === 'has_profile') {
    return { values: ['true', 'false'] };
  }

  if (property.startsWith('properties.')) {
    const rows = await runQuery<{ property_value: string; created_at: string }>(
      deps,
      eventPropertyValuesQuery(
        projectId,
        property.replace(/^properties\./, ''),
        event,
        deps.config.query.eventPropertyValueAutocompleteLimit ??
          DEFAULT_EVENT_PROPERTY_VALUE_AUTOCOMPLETE_LIMIT
      )
    );
    return { values: rows.map((row) => row.property_value) };
  }

  if (property.startsWith('profile.')) {
    const rows = await runQuery<{ values: string }>(
      deps,
      profilePropertyValuesQuery(projectId, getProfilePropertySelect(property))
    );
    return { values: nonEmptyValues(rows) };
  }

  if (property.startsWith('group.')) {
    const rows = await runQuery<{ values: string }>(
      deps,
      groupPropertyValuesQuery(projectId, getGroupPropertySelect(property))
    );
    return { values: nonEmptyValues(rows) };
  }

  // Cohort filters use a dedicated cohort multi-select on the client; a
  // `cohort:<uuid>` identifier would be a ClickHouse syntax error here.
  if (property === 'cohort' || property.startsWith('cohort:')) {
    return { values: [] };
  }

  // Unknown identifiers (saved-report typos, columns from older clients) get
  // an empty list rather than UNKNOWN_IDENTIFIER.
  const resolvedProperty = normalizeEventField(property);
  if (!isKnownEventField(resolvedProperty)) {
    return { values: [] };
  }
  const rows = await runQuery<{ values: string[] }>(
    deps,
    eventFieldValuesQuery({
      projectId,
      column: resolvedProperty,
      selectExpression: getSelectPropertyKey(resolvedProperty),
      event,
    })
  );
  return {
    values: pipe(
      (data: typeof rows) => map(prop('values'), data),
      flatten,
      uniq,
      sort((a, b) => a.length - b.length)
    )(rows),
  };
}

// --- funnel / conversion / sankey / retention --------------------------------

async function currentAndPreviousPeriod(
  deps: ServiceDeps,
  chartInput: IReportInput
) {
  const { timezone } = await getSettingsForProject(deps, chartInput.projectId);
  const currentPeriod = getChartStartEndDate(chartInput, timezone);
  const previousPeriod = getChartPrevStartEndDate(currentPeriod);
  return { timezone, currentPeriod, previousPeriod };
}

export async function getFunnelChart(
  deps: ServiceDeps,
  chartInput: IReportInput
) {
  const { timezone, currentPeriod, previousPeriod } =
    await currentAndPreviousPeriod(deps, chartInput);

  const [current, previous] = await Promise.all([
    getFunnel(deps, { ...chartInput, ...currentPeriod, timezone }),
    chartInput.previous
      ? getFunnel(deps, { ...chartInput, ...previousPeriod, timezone })
      : Promise.resolve(null),
  ]);

  return { current, previous };
}

export async function getConversionChart(
  deps: ServiceDeps,
  chartInput: IReportInput
) {
  const { timezone, currentPeriod, previousPeriod } =
    await currentAndPreviousPeriod(deps, chartInput);
  const interval = chartInput.interval;

  const [current, previous] = await Promise.all([
    getConversion(deps, {
      ...chartInput,
      ...currentPeriod,
      interval,
      timezone,
    }),
    chartInput.previous
      ? getConversion(deps, {
          ...chartInput,
          ...previousPeriod,
          interval,
          timezone,
        })
      : Promise.resolve(null),
  ]);

  return {
    current: current.map((serie, serieIndex) => ({
      ...serie,
      data: serie.data.map((point, pointIndex) => ({
        ...point,
        previousRate: previous?.[serieIndex]?.data?.[pointIndex]?.rate,
      })),
    })),
    previous,
  };
}

export async function getSankeyChart(deps: ServiceDeps, input: IReportInput) {
  const { timezone } = await getSettingsForProject(deps, input.projectId);
  const currentPeriod = getChartStartEndDate(input, timezone);
  assertSankeyWindowIsAnswerable(
    currentPeriod.startDate,
    currentPeriod.endDate
  );

  const options = input.options;
  if (!options || options.type !== 'sankey') {
    throw new Error('Sankey options are required');
  }

  const eventSeries = onlyReportEvents(
    mergeGlobalFilters(input.series, input.globalFilters)
  );
  if (!eventSeries[0]) {
    throw new Error('Start and end events are required');
  }

  return getSankey(deps, {
    projectId: input.projectId,
    startDate: currentPeriod.startDate,
    endDate: currentPeriod.endDate,
    steps: options.steps,
    mode: options.mode,
    startEvent: eventSeries[0],
    endEvent: eventSeries[1],
    exclude: options.exclude || [],
    include: options.include,
    timezone,
  });
}

export interface RetentionChartInput {
  projectId: string;
  firstEvent: string[];
  secondEvent: string[];
  criteria: ICriteria;
  startDate?: string | null;
  endDate?: string | null;
  interval: IInterval;
  range: IChartRange;
  filters?: IChartEventFilter[];
}

/**
 * A shared retention report takes its events from the saved series: each
 * series' `filters[0]` is the event-name selector, everything else is an
 * audience filter.
 */
function retentionInputFromReport(
  report: NonNullable<IServiceReport>,
  input: RetentionChartInput
): RetentionChartInput {
  const retentionOptions =
    report.options?.type === 'retention' ? report.options : undefined;
  const eventSeries = onlyEventSeries(report.series);
  const firstEvent = (eventSeries[0]?.filters?.[0]?.value ?? []).map(String);
  const secondEvent = (eventSeries[1]?.filters?.[0]?.value ?? []).map(String);
  if (firstEvent.length === 0 || secondEvent.length === 0) {
    throw new Error('Report must have at least 2 event series');
  }

  return {
    projectId: report.projectId,
    firstEvent,
    secondEvent,
    criteria: retentionOptions?.criteria ?? input.criteria,
    range: input.range ?? report.range,
    startDate: input.startDate ?? report.startDate,
    endDate: input.endDate ?? report.endDate,
    interval: input.interval ?? report.interval,
    filters: [
      ...(report.globalFilters ?? []),
      ...eventSeries.flatMap((serie) =>
        (serie.filters ?? []).filter((filter) => filter.name !== 'name')
      ),
    ],
  };
}

function onlyEventSeries(series: NonNullable<IServiceReport>['series']) {
  return series.filter((item) => item.type === 'event');
}

export async function getRetentionChart(
  deps: ServiceDeps,
  report: NonNullable<IServiceReport> | null,
  input: RetentionChartInput
) {
  const resolved = report ? retentionInputFromReport(report, input) : input;

  const { timezone } = await getSettingsForProject(deps, resolved.projectId);
  const dates = getChartStartEndDate(
    {
      range: resolved.range,
      startDate: resolved.startDate,
      endDate: resolved.endDate,
    },
    timezone
  );

  return getRetentionCohort(deps, {
    projectId: resolved.projectId,
    firstEvent: resolved.firstEvent,
    secondEvent: resolved.secondEvent,
    criteria: resolved.criteria,
    interval: resolved.interval,
    startDate: dates.startDate,
    endDate: dates.endDate,
    filters: resolved.filters ?? [],
  });
}

// --- drill-down profiles -----------------------------------------------------

export interface ChartBucketProfilesRequest {
  projectId: string;
  /** ISO string of the data point's bucket. */
  date: string;
  interval: IInterval;
  series: IChartSeries;
  breakdowns?: Record<string, string>;
}

/** Profiles behind one data point of a time-series chart. */
export async function getChartBucketProfiles(
  deps: ServiceDeps,
  input: ChartBucketProfilesRequest
): Promise<IServiceProfile[]> {
  const serie = input.series[0];
  if (!serie) {
    throw new Error('Series not found');
  }
  if (serie.type !== 'event') {
    throw new Error('Series must be an event');
  }

  const rows = await runQuery<{ profile_id: string }>(
    deps,
    chartBucketProfilesQuery({
      projectId: input.projectId,
      bucketDate: formatClickhouseDate(new Date(input.date)),
      interval: input.interval,
      event: serie,
      breakdowns: input.breakdowns ?? {},
      limit: BUCKET_PROFILES_LIMIT,
    })
  );
  const ids = rows.map((row) => row.profile_id).filter(Boolean);
  if (ids.length === 0) {
    return [];
  }
  return getProfilesInBatches(
    deps,
    ids,
    input.projectId,
    BUCKET_PROFILES_BATCH_SIZE
  );
}

export interface FunnelStepProfilesRequest {
  projectId: string;
  startDate?: string | null;
  endDate?: string | null;
  series: IChartSeries;
  /** 0-based funnel step. */
  stepIndex: number;
  /** Users who dropped off at the step, instead of those who reached it. */
  showDropoffs?: boolean;
  funnelWindow?: number;
  funnelGroup?: string;
  breakdowns?: { name: string }[];
  breakdownValues?: string[];
  range: IChartRange;
}

/**
 * Profiles at (or dropping off at) one funnel step. Built on the funnel
 * module's own base: the CTE has to be the chart's own, or breakdown
 * expressions referencing a `profile` / `cohort_<id>` alias this side never
 * joined fail with UNKNOWN_IDENTIFIER.
 */
export async function getFunnelStepProfiles(
  deps: ServiceDeps,
  input: FunnelStepProfilesRequest
): Promise<IServiceProfile[]> {
  const { timezone } = await getSettingsForProject(deps, input.projectId);
  const {
    projectId,
    series,
    stepIndex,
    showDropoffs = false,
    funnelWindow,
    funnelGroup,
    breakdowns: inputBreakdowns = [],
    breakdownValues = [],
  } = input;
  const { startDate, endDate } = getChartStartEndDate(input, timezone);

  const ids = await getFunnelProfileIds(deps, {
    projectId,
    startDate,
    endDate,
    series,
    breakdowns: inputBreakdowns,
    funnelWindow,
    funnelGroup,
    timezone,
    // stepIndex is 0-based, level is 1-based.
    targetLevel: stepIndex + 1,
    showDropoffs,
    breakdownValues,
    limit: FUNNEL_PROFILES_LIMIT,
  });
  if (ids.length === 0) {
    return [];
  }
  return getProfilesInBatches(deps, ids, projectId, FUNNEL_PROFILES_BATCH_SIZE);
}

// --- service -----------------------------------------------------------------

// The funnel, conversion, sankey and retention services live in this module's
// own sibling files rather than in modules of their own, so they FOLD INTO
// `chart` rather than becoming four more `Services` members: chart.service.ts
// is already the dispatcher every caller goes through (`getFunnelChart` /
// `getConversionChart` / `getSankeyChart` / `getRetentionChart`), and a
// `Services` key per file would name four things that are not modules.

export function createChartService(
  deps: ServiceDeps,
  services: () => Services
) {
  // The four chart sub-modules each expose their own `create*Service(deps)`.
  // `services.ts` binds each under its own key; `chart` composes them as well,
  // so the callers that reach a funnel/retention method through the chart
  // facade keep working. Both bind the same stateless closures.
  const funnel = createFunnelService(deps, services);
  const conversion = createConversionService(deps, services);
  const sankey = createSankeyService(deps, services);
  const retention = createRetentionService(deps, services);

  return {
    // chart
    execute: (input: IReportInput): Promise<FinalChart> =>
      executeChart(deps, input),
    executeAggregate: (input: IReportInput): Promise<FinalChart> =>
      executeAggregateChart(deps, input),
    resolveReportInput,
    getProjectCard: (projectId: string): ReturnType<typeof getProjectCard> =>
      getProjectCard(deps, projectId),
    listChartEvents: (projectId: string): Promise<ChartEventOption[]> =>
      listChartEvents(deps, projectId),
    listChartProperties: (
      input: Parameters<typeof listChartProperties>[1]
    ): Promise<string[]> => listChartProperties(deps, input),
    getChartPropertyValues: (
      input: Parameters<typeof getChartPropertyValues>[1]
    ): Promise<{ values: string[] }> => getChartPropertyValues(deps, input),
    bucketProfiles: (
      input: ChartBucketProfilesRequest
    ): Promise<IServiceProfile[]> => getChartBucketProfiles(deps, input),
    funnelStepProfiles: (
      input: FunnelStepProfilesRequest
    ): Promise<IServiceProfile[]> => getFunnelStepProfiles(deps, input),
    // funnel
    getFunnelGroup: funnel.getFunnelGroup,
    /** The funnel row -> serie grouping (funnel.service.ts's `toSeries`). */
    toFunnelSeries: funnel.toSeries,
    getFunnelChart: (
      chartInput: IReportInput
    ): ReturnType<typeof getFunnelChart> => getFunnelChart(deps, chartInput),
    getFunnel: funnel.getFunnel,
    getFunnelCore: funnel.getFunnelCore,
    buildFunnelBase: funnel.buildFunnelBase,
    getFunnelProfileIds: funnel.getFunnelProfileIds,
    // conversion
    getConversionChart: (
      chartInput: IReportInput
    ): ReturnType<typeof getConversionChart> =>
      getConversionChart(deps, chartInput),
    getConversion: conversion.getConversion,
    // sankey
    getRawWhereClause: sankey.getRawWhereClause,
    getSankeyChart: (input: IReportInput): ReturnType<typeof getSankeyChart> =>
      getSankeyChart(deps, input),
    getSankey: sankey.getSankey,
    getUserFlowCore: sankey.getUserFlowCore,
    // retention
    processCohortData: retention.processCohortData,
    getRetentionChart: (
      report: NonNullable<IServiceReport> | null,
      input: RetentionChartInput
    ): ReturnType<typeof getRetentionChart> =>
      getRetentionChart(deps, report, input),
    getRetentionCohort: retention.getRetentionCohort,
    getRetentionCohortCore: retention.getRetentionCohortCore,
    getRetentionSeries: retention.getRetentionSeries,
    getRetentionLastSeenSeries: retention.getRetentionLastSeenSeries,
    getRollingActiveUsers: retention.getRollingActiveUsers,
    getRollingActiveUsersCore: retention.getRollingActiveUsersCore,
    getWeeklyRetentionSeriesCore: retention.getWeeklyRetentionSeriesCore,
    getEngagementCore: retention.getEngagementCore,
  };
}
