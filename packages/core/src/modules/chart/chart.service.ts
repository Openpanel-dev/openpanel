// Ported from packages/db/src/services/chart.service.ts, packages/db/src/
// engine/* and the handler bodies of packages/trpc/src/routers/chart.ts
// (M7-003). Every ClickHouse statement this module runs is a `sql` fragment
// from src/chart.sql.ts, proven byte-equivalent to V1 in
// src/chart.sql.proof.md; V1's chart.service and engine are re-export shims
// onto this module and its router delegates here (DELEGATE PATTERN).
//
// `funnel`, `conversion`, `sankey`, `cohort` and `getFunnelProfiles` still
// run V1's funnel/conversion/sankey/retention services — those queries are
// M7-004/M7-005's, and are reached lazily through @openpanel/db until then.
//
// db/ch access is lazy (`load*`), as in the sibling modules: the barrel pulls
// this module into nearly every core test file, and constructing
// @openpanel/db's clients at import time costs a pino-pretty worker per file.

import type { SqlFragment } from '@openpanel/db/src/clickhouse/sql';
import {
  getChartPrevStartEndDate,
  getChartStartEndDate,
} from '@openpanel/db/src/services/date.service';
import type { IServiceReport } from '@openpanel/db/src/services/reports.service';
import type {
  FinalChart,
  IChartEventFilter,
  IChartRange,
  IChartSeries,
  ICriteria,
  IInterval,
  IReportInput,
} from '@openpanel/validation';
import { flatten, map, pipe, prop, sort, uniq } from 'ramda';
import sqlstring from 'sqlstring';
import type { ServiceDeps } from '../../services';
import { getEventMetasCached } from '../event/event.service';
import { getSettingsForProject } from '../organization/organization.service';
import {
  getProfilePropertyKeysCached,
  getProfilesCached,
  type IServiceProfile,
} from '../profile/profile.service';
import {
  chartBucketProfilesQuery,
  eventFieldValuesQuery,
  eventNamesWithCountQuery,
  eventPropertyKeysQuery,
  eventPropertyValuesQuery,
  groupPropertyValuesQuery,
  profilePropertyValuesQuery,
  projectCardChartQuery,
  projectCardMetricsQuery,
} from './src/chart.sql';
import { formatClickhouseDate } from './src/dates';
import { executeAggregateChart, executeChart } from './src/engine/execute';
import {
  getGroupPropertySelect,
  getProfilePropertySelect,
  getSelectPropertyKey,
  isKnownEventField,
  normalizeEventField,
} from './src/field-resolution';

export {
  type ChartBucketProfilesInput,
  ChartCohortIdError,
} from './src/chart.sql';
export {
  type AggregateChartSqlInput,
  type ChartSqlInput,
  fetchCohortsMetadata,
  fetchProjectCohorts,
  getAggregateChartSql,
  getChartSql,
} from './src/chart-statement';
export {
  AggregateChartEngine,
  ChartEngine,
  executeAggregateChart,
  executeChart,
} from './src/engine/execute';
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
  rewriteProfilePropertyRefs,
  transformPropertyKey,
} from './src/field-resolution';
export {
  type FilterTableScope,
  getEventFiltersWhereClause,
} from './src/filter-where';

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
const EVENT_PROPERTY_VALUE_AUTOCOMPLETE_LIMIT = (() => {
  const raw = process.env.EVENT_PROPERTY_VALUE_AUTOCOMPLETE_LIMIT;
  const parsed = raw && /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_EVENT_PROPERTY_VALUE_AUTOCOMPLETE_LIMIT;
})();

/** Profile lookups are batched so the `IN (...)` never exceeds max_query_size. */
const BUCKET_PROFILES_BATCH_SIZE = 200;
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

function loadChClient() {
  return import('@openpanel/db/src/clickhouse/client');
}

function loadFunnelService() {
  return import('@openpanel/db/src/services/funnel.service');
}

function loadConversionService() {
  return import('@openpanel/db/src/services/conversion.service');
}

function loadSankeyService() {
  return import('@openpanel/db/src/services/sankey.service');
}

function loadRetentionService() {
  return import('@openpanel/db/src/services/retention.service');
}

function loadReportsService() {
  return import('@openpanel/db/src/services/reports.service');
}

async function runQuery<T extends object>(
  statement: SqlFragment,
  timezone?: string
): Promise<T[]> {
  const { chQuery } = await loadChClient();
  return chQuery<T>(
    statement,
    timezone ? { session_timezone: timezone } : undefined
  );
}

async function getProfilesInBatches(
  ids: string[],
  projectId: string,
  batchSize: number
): Promise<IServiceProfile[]> {
  const profiles: IServiceProfile[] = [];
  for (let index = 0; index < ids.length; index += batchSize) {
    profiles.push(
      ...(await getProfilesCached(
        ids.slice(index, index + batchSize),
        projectId
      ))
    );
  }
  return profiles;
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

export async function getProjectCard(projectId: string): Promise<{
  chart: ProjectCardChartRow[];
  metrics: ProjectCardMetrics | undefined;
  trend: ProjectCardTrend;
}> {
  const { timezone } = await getSettingsForProject(projectId);
  const [chart, [metrics]] = await Promise.all([
    runQuery<ProjectCardChartRow>(projectCardChartQuery(projectId), timezone),
    runQuery<ProjectCardMetrics>(projectCardMetricsQuery(projectId), timezone),
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
  projectId: string
): Promise<ChartEventOption[]> {
  const [events, meta] = await Promise.all([
    runQuery<{ name: string; count: number }>(
      eventNamesWithCountQuery(projectId)
    ),
    getEventMetasCached(projectId),
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

export async function listChartProperties(input: {
  projectId: string;
  event?: string;
}): Promise<string[]> {
  const { projectId, event } = input;
  const [profileKeys, eventKeys] = await Promise.all([
    getProfilePropertyKeysCached(projectId),
    runQuery<{ property_key: string; created_at: string }>(
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

export async function getChartPropertyValues(input: {
  projectId: string;
  event: string;
  property: string;
}): Promise<{ values: string[] }> {
  const { projectId, event, property } = input;

  if (property === 'has_profile') {
    return { values: ['true', 'false'] };
  }

  if (property.startsWith('properties.')) {
    const rows = await runQuery<{ property_value: string; created_at: string }>(
      eventPropertyValuesQuery(
        projectId,
        property.replace(/^properties\./, ''),
        event,
        EVENT_PROPERTY_VALUE_AUTOCOMPLETE_LIMIT
      )
    );
    return { values: rows.map((row) => row.property_value) };
  }

  if (property.startsWith('profile.')) {
    const rows = await runQuery<{ values: string }>(
      profilePropertyValuesQuery(projectId, getProfilePropertySelect(property))
    );
    return { values: nonEmptyValues(rows) };
  }

  if (property.startsWith('group.')) {
    const rows = await runQuery<{ values: string }>(
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
    eventFieldValuesQuery(
      projectId,
      getSelectPropertyKey(resolvedProperty),
      event
    )
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

// --- funnel / conversion / sankey / cohort (V1 services, M7-004/M7-005) -----

async function currentAndPreviousPeriod(chartInput: IReportInput) {
  const { timezone } = await getSettingsForProject(chartInput.projectId);
  const currentPeriod = getChartStartEndDate(chartInput, timezone);
  const previousPeriod = getChartPrevStartEndDate(currentPeriod);
  return { timezone, currentPeriod, previousPeriod };
}

export async function getFunnelChart(chartInput: IReportInput) {
  const { funnelService } = await loadFunnelService();
  const { timezone, currentPeriod, previousPeriod } =
    await currentAndPreviousPeriod(chartInput);

  const [current, previous] = await Promise.all([
    funnelService.getFunnel({ ...chartInput, ...currentPeriod, timezone }),
    chartInput.previous
      ? funnelService.getFunnel({ ...chartInput, ...previousPeriod, timezone })
      : Promise.resolve(null),
  ]);

  return { current, previous };
}

export async function getConversionChart(chartInput: IReportInput) {
  const { conversionService } = await loadConversionService();
  const { timezone, currentPeriod, previousPeriod } =
    await currentAndPreviousPeriod(chartInput);
  const interval = chartInput.interval;

  const [current, previous] = await Promise.all([
    conversionService.getConversion({
      ...chartInput,
      ...currentPeriod,
      interval,
      timezone,
    }),
    chartInput.previous
      ? conversionService.getConversion({
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

export async function getSankeyChart(input: IReportInput) {
  const [{ sankeyService }, { mergeGlobalFilters, onlyReportEvents }] =
    await Promise.all([loadSankeyService(), loadReportsService()]);
  const { timezone } = await getSettingsForProject(input.projectId);
  const currentPeriod = getChartStartEndDate(input, timezone);

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

  return sankeyService.getSankey({
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
  report: NonNullable<IServiceReport> | null,
  input: RetentionChartInput
) {
  const { getRetentionCohort } = await loadRetentionService();
  const resolved = report ? retentionInputFromReport(report, input) : input;

  const { timezone } = await getSettingsForProject(resolved.projectId);
  const dates = getChartStartEndDate(
    {
      range: resolved.range,
      startDate: resolved.startDate,
      endDate: resolved.endDate,
    },
    timezone
  );

  return getRetentionCohort({
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

/** Profiles behind one data point of a time-series chart (V1 `getProfiles`). */
export async function getChartBucketProfiles(
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
    chartBucketProfilesQuery({
      projectId: input.projectId,
      bucketDate: formatClickhouseDate(new Date(input.date)),
      interval: input.interval,
      event: serie,
      breakdowns: input.breakdowns ?? {},
    })
  );
  const ids = rows.map((row) => row.profile_id).filter(Boolean);
  if (ids.length === 0) {
    return [];
  }
  return getProfilesInBatches(ids, input.projectId, BUCKET_PROFILES_BATCH_SIZE);
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
 * Profiles at (or dropping off at) one funnel step. Runs on V1's clix funnel
 * builder until the funnel module (M7-004) converts it: the CTE has to be the
 * chart's own, or breakdown expressions referencing a `profile` / `cohort_<id>`
 * alias this side never joined fail with UNKNOWN_IDENTIFIER.
 */
export async function getFunnelStepProfiles(
  input: FunnelStepProfilesRequest
): Promise<IServiceProfile[]> {
  const { funnelService, EMPTY_BREAKDOWN_LABEL } = await loadFunnelService();
  const { timezone } = await getSettingsForProject(input.projectId);
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
  // stepIndex is 0-based, level is 1-based.
  const targetLevel = stepIndex + 1;

  const { query, breakdowns } = await funnelService.buildFunnelBase({
    projectId,
    startDate,
    endDate,
    series,
    breakdowns: inputBreakdowns,
    funnelWindow,
    funnelGroup,
    timezone,
  });

  // Same shape as the chart's `funnel` CTE: windowFunnel is already computed
  // per primary key, so drop level=0 and select distinct profiles.
  query.with('funnel', 'SELECT * FROM session_funnel WHERE level != 0');
  query.select(['DISTINCT profile_id']).from('funnel');
  if (showDropoffs) {
    query.where('level', '=', targetLevel);
  } else {
    query.where('level', '>=', targetLevel);
  }

  // The clicked row carries DISPLAY labels (trimmed, empty/null shown as
  // EMPTY_BREAKDOWN_LABEL), so match against the same normalization.
  // toString/ifNull keep the comparison valid for numeric and Nullable
  // breakdown columns.
  breakdowns.forEach((_, index) => {
    const value = breakdownValues[index];
    if (value === undefined) {
      return;
    }
    const normalized = `trim(ifNull(toString(b_${index}), ''))`;
    if (value === EMPTY_BREAKDOWN_LABEL) {
      query.rawWhere(
        `(${normalized} = '' OR ${normalized} = ${sqlstring.escape(EMPTY_BREAKDOWN_LABEL)})`
      );
    } else {
      query.rawWhere(`${normalized} = ${sqlstring.escape(value)}`);
    }
  });

  query.limit(FUNNEL_PROFILES_LIMIT);

  const rows = (await query.execute()) as { profile_id: string }[];
  const ids = rows.map((row) => row.profile_id).filter(Boolean);
  if (ids.length === 0) {
    return [];
  }
  return getProfilesInBatches(ids, projectId, FUNNEL_PROFILES_BATCH_SIZE);
}

// --- service -----------------------------------------------------------------

export interface ChartService {
  execute(input: IReportInput): Promise<FinalChart>;
  executeAggregate(input: IReportInput): Promise<FinalChart>;
  bucketProfiles(input: ChartBucketProfilesRequest): Promise<IServiceProfile[]>;
}

export function createChartService(_deps: ServiceDeps): ChartService {
  return {
    execute: executeChart,
    executeAggregate: executeAggregateChart,
    bucketProfiles: getChartBucketProfiles,
  };
}
