// Ported from packages/db/src/services/chart.service.ts, packages/db/src/
// engine/* and the handler bodies of packages/trpc/src/routers/chart.ts
// (M7-003). Every ClickHouse statement this module runs is a `sql` fragment
// from src/chart.sql.ts, proven byte-equivalent to V1 in
// src/chart.sql.proof.md; V1's chart.service and engine are re-export shims
// onto this module and its router delegates here (DELEGATE PATTERN).
//
// The funnel, conversion, sankey and retention statements this module
// dispatches to live in the sibling `*.service.ts` files of this module
// (M7-004).
//
// M10-003: every function takes `ServiceDeps` and reaches ClickHouse and
// Postgres as `deps.ch` / `deps.db`. The `load*` lazy loaders are gone, and
// so is the `@openpanel/core` self-barrel hop this file used to make for the
// report module's `mergeGlobalFilters` / `onlyReportEvents` — those are
// imported straight from `../report/src/series` (docs/TECH_DEBT.md §2, §4).
// The one thing still value-imported from `@openpanel/db` under `./src/` is
// ADR-013's `sql` tag, which ADR-007 keeps in `packages/db` by name: a
// compile-time template tag, no client and no request scope.

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
import type { ServiceDeps } from '../../services';
import {
  getChartPrevStartEndDate,
  getChartStartEndDate,
} from '../../shared/date';
import { getEventMetasCached } from '../event/event.service';
import { getSettingsForProject } from '../organization/organization.service';
import {
  getProfilePropertyKeysCached,
  getProfilesCached,
  type IServiceProfile,
} from '../profile/profile.service';
import type { IServiceReport } from '../report/report.service';
import { mergeGlobalFilters, onlyReportEvents } from '../report/src/series';
import { createConversionService, getConversion } from './conversion.service';
import {
  buildFunnelBase,
  buildSessionsCte,
  createFunnelService,
  getFunnel,
  getFunnelCore,
  getFunnelGroup,
  getFunnelProfileIds,
  toSeries as toFunnelSeries,
} from './funnel.service';
import {
  createRetentionService,
  getEngagementCore,
  getRetentionCohort,
  getRetentionCohortCore,
  getRetentionLastSeenSeries,
  getRetentionSeries,
  getRollingActiveUsers,
  getRollingActiveUsersCore,
  getWeeklyRetentionSeriesCore,
  processCohortData,
} from './retention.service';
import {
  createSankeyService,
  getSankey,
  getUserFlowCore,
} from './sankey.service';
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
import { runQuery } from './src/run-query';

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

async function getProfilesInBatches(
  deps: ServiceDeps,
  ids: string[],
  projectId: string,
  batchSize: number
): Promise<IServiceProfile[]> {
  const profiles: IServiceProfile[] = [];
  for (let index = 0; index < ids.length; index += batchSize) {
    profiles.push(
      ...(await getProfilesCached(
        deps,
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
        EVENT_PROPERTY_VALUE_AUTOCOMPLETE_LIMIT
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

/** Profiles behind one data point of a time-series chart (V1 `getProfiles`). */
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
// own sibling files, not in modules of their own (ADR-007 gives one service
// per module), so they FOLD INTO `ChartService` rather than becoming four
// more `Services` members: chart.service.ts is already the dispatcher every
// caller goes through (`getFunnelChart` / `getConversionChart` /
// `getSankeyChart` / `getRetentionChart`), and a `Services` key per file
// would name four things that are not modules.

export interface ChartService {
  // chart
  execute(input: IReportInput): Promise<FinalChart>;
  executeAggregate(input: IReportInput): Promise<FinalChart>;
  resolveReportInput(
    report: NonNullable<IServiceReport> | null,
    input: ShareableReportInput
  ): IReportInput;
  getProjectCard(projectId: string): ReturnType<typeof getProjectCard>;
  listChartEvents(projectId: string): Promise<ChartEventOption[]>;
  listChartProperties(
    input: Parameters<typeof listChartProperties>[1]
  ): Promise<string[]>;
  getChartPropertyValues(
    input: Parameters<typeof getChartPropertyValues>[1]
  ): Promise<{ values: string[] }>;
  bucketProfiles(input: ChartBucketProfilesRequest): Promise<IServiceProfile[]>;
  funnelStepProfiles(
    input: FunnelStepProfilesRequest
  ): Promise<IServiceProfile[]>;
  // funnel
  getFunnelGroup(group?: string): ReturnType<typeof getFunnelGroup>;
  /** The funnel row -> serie grouping (funnel.service.ts's `toSeries`). */
  toFunnelSeries(
    ...args: Parameters<typeof toFunnelSeries>
  ): ReturnType<typeof toFunnelSeries>;
  buildSessionsCte(
    input: Parameters<typeof buildSessionsCte>[0]
  ): ReturnType<typeof buildSessionsCte>;
  getFunnelChart(chartInput: IReportInput): ReturnType<typeof getFunnelChart>;
  getFunnel(
    input: Parameters<typeof getFunnel>[1]
  ): ReturnType<typeof getFunnel>;
  getFunnelCore(
    input: Parameters<typeof getFunnelCore>[1]
  ): ReturnType<typeof getFunnelCore>;
  buildFunnelBase(
    input: Parameters<typeof buildFunnelBase>[1]
  ): ReturnType<typeof buildFunnelBase>;
  getFunnelProfileIds(
    input: Parameters<typeof getFunnelProfileIds>[1]
  ): Promise<string[]>;
  // conversion
  getConversionChart(
    chartInput: IReportInput
  ): ReturnType<typeof getConversionChart>;
  getConversion(
    input: Parameters<typeof getConversion>[1]
  ): ReturnType<typeof getConversion>;
  // sankey
  getRawWhereClause(
    type: 'events' | 'sessions',
    filters: IChartEventFilter[]
  ): string;
  getSankeyChart(input: IReportInput): ReturnType<typeof getSankeyChart>;
  getSankey(
    input: Parameters<typeof getSankey>[1]
  ): ReturnType<typeof getSankey>;
  getUserFlowCore(
    input: Parameters<typeof getUserFlowCore>[1]
  ): ReturnType<typeof getUserFlowCore>;
  // retention
  processCohortData(
    ...args: Parameters<typeof processCohortData>
  ): ReturnType<typeof processCohortData>;
  getRetentionChart(
    report: NonNullable<IServiceReport> | null,
    input: RetentionChartInput
  ): ReturnType<typeof getRetentionChart>;
  getRetentionCohort(
    input: Parameters<typeof getRetentionCohort>[1]
  ): ReturnType<typeof getRetentionCohort>;
  getRetentionCohortCore(
    projectId: string
  ): ReturnType<typeof getRetentionCohortCore>;
  getRetentionSeries(
    input: Parameters<typeof getRetentionSeries>[1]
  ): ReturnType<typeof getRetentionSeries>;
  getRetentionLastSeenSeries(
    input: Parameters<typeof getRetentionLastSeenSeries>[1]
  ): ReturnType<typeof getRetentionLastSeenSeries>;
  getRollingActiveUsers(
    input: Parameters<typeof getRollingActiveUsers>[1]
  ): ReturnType<typeof getRollingActiveUsers>;
  getRollingActiveUsersCore(
    input: Parameters<typeof getRollingActiveUsersCore>[1]
  ): ReturnType<typeof getRollingActiveUsersCore>;
  getWeeklyRetentionSeriesCore(
    projectId: string
  ): ReturnType<typeof getWeeklyRetentionSeriesCore>;
  getEngagementCore(projectId: string): ReturnType<typeof getEngagementCore>;
}

export function createChartService(deps: ServiceDeps): ChartService {
  // The four chart sub-modules each expose their own `create*Service(deps)`
  // (ADR-007). `services.ts` binds each under its own key; `chart` composes
  // them as well, so the callers that reach a funnel/retention method through
  // the chart facade keep working. Both bind the same stateless closures.
  const funnel = createFunnelService(deps);
  const conversion = createConversionService(deps);
  const sankey = createSankeyService(deps);
  const retention = createRetentionService(deps);

  return {
    execute: (input) => executeChart(deps, input),
    executeAggregate: (input) => executeAggregateChart(deps, input),
    resolveReportInput,
    getProjectCard: (projectId) => getProjectCard(deps, projectId),
    listChartEvents: (projectId) => listChartEvents(deps, projectId),
    listChartProperties: (input) => listChartProperties(deps, input),
    getChartPropertyValues: (input) => getChartPropertyValues(deps, input),
    bucketProfiles: (input) => getChartBucketProfiles(deps, input),
    funnelStepProfiles: (input) => getFunnelStepProfiles(deps, input),
    getFunnelGroup: funnel.getFunnelGroup,
    toFunnelSeries: funnel.toSeries,
    buildSessionsCte: funnel.buildSessionsCte,
    getFunnelChart: (chartInput) => getFunnelChart(deps, chartInput),
    getFunnel: funnel.getFunnel,
    getFunnelCore: funnel.getFunnelCore,
    buildFunnelBase: funnel.buildFunnelBase,
    getFunnelProfileIds: funnel.getFunnelProfileIds,
    getConversionChart: (chartInput) => getConversionChart(deps, chartInput),
    getConversion: conversion.getConversion,
    getRawWhereClause: sankey.getRawWhereClause,
    getSankeyChart: (input) => getSankeyChart(deps, input),
    getSankey: sankey.getSankey,
    getUserFlowCore: sankey.getUserFlowCore,
    processCohortData: retention.processCohortData,
    getRetentionChart: (report, input) =>
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
