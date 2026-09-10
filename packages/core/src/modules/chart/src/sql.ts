// Every ClickHouse query the chart module runs, as pure `sql` fragments
// (ADR-013). Converted 1:1 from packages/db/src/services/chart.service.ts
// (`getChartSql`, `getAggregateChartSql`) and packages/trpc/src/routers/
// chart.ts (M7-003): the SQL text is V1's, with every chart-level value —
// project id, event name, dates, timezone, cohort ids and names, limits —
// bound as a `{pN:Type}` parameter instead of an escaped literal. Each
// builder's result set was diffed against V1's on the local prod-copy; the
// statements, params, row counts and timings are in sql.proof.md.
//
// The field resolver and filter compiler still render text (see compiled.ts);
// their output is spliced, everything else is bound. Dates bind as V1's own
// strings: a String param in a DateTime position is parsed exactly like the
// literal it replaces.
//
// Cluster note (docs/ENVIRONMENT.md): `events`, `profiles`, `groups` and
// `cohort_members` are Distributed on Cloud. The cohort CTEs, the profile,
// group and cohort LEFT ANY JOINs and any `IN (SELECT ...)` a filter compiles
// keep V1's exact shape and run under the client's
// `distributed_product_mode: 'allow'` as before.
//
// The keyed part records below are a local, function-scoped builder (ADR-013
// R5): V1 assigned and re-assigned `sb.select.count`, `sb.where.property`,
// ... by key, and a keyed record keeps that exact clause order — which is
// what makes the proof diff a pure literal→param diff.

import { type SqlFragment, sql } from '@openpanel/db/src/clickhouse/sql';
import type {
  IChartBreakdown,
  IChartEvent,
  IInterval,
} from '../../report/report.constants';
import { compiledText, fragmentWithProfileRefs } from './compiled';
import { formatClickhouseDate } from './dates';
import {
  buildAllCohortsLabelExpr,
  buildAllCohortsMembershipQuery,
  buildCohortMembershipQuery,
  buildGroupsQuery,
  CHART_TABLE,
  type CohortMetadata,
  cohortBreakdownLabelExpr,
  collectBreakdownCohortIds,
  collectProfileCteFields,
  collectProfilePropertyKeys,
  extractCohortId,
  getCohortAlias,
  getSelectPropertyKey,
  isAllCohortsBreakdown,
  isKnownEventField,
  isNumericColumn,
  PROFILE_CTE_FIELDS,
  profilePropertiesCteSelect,
} from './field-resolution';
import { getEventFiltersWhereClause } from './filter-where';

const EVENTS_ALIAS = 'e';
const ALL_COHORTS_ALIAS = '_all_cohorts';
// Cohort ids are Postgres uuids; they also name a CTE and a join alias, so
// anything else is refused rather than inlined (V1 inlined it unchecked).
const COHORT_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

const MATH_FUNCTION_BY_SEGMENT: Record<string, string> = {
  property_sum: 'sum',
  property_average: 'avg',
  property_max: 'max',
  property_min: 'min',
};

export const PROPERTY_VALUES_LIMIT = 100_000;
/** `profiles` columns a `profile.<field>` reference may select (ADR-013 R3). */
const PROFILE_COLUMNS = [
  'id',
  'is_external',
  'first_name',
  'last_name',
  'email',
  'avatar',
  'properties',
  'project_id',
  'groups',
  'created_at',
  'last_seen_at',
] as const;

export type ChartQueryEvent = Pick<
  IChartEvent,
  'name' | 'segment' | 'filters' | 'property'
>;

/** Breakdowns after `resolveChartBreakdowns`, plus the cohort rows they need. */
export interface ResolvedChartBreakdowns {
  breakdowns: IChartBreakdown[];
  allCohorts: CohortMetadata[];
  cohortMetadata: ReadonlyMap<string, CohortMetadata>;
}

export type ChartSeriesQueryInput = ResolvedChartBreakdowns & {
  event: ChartQueryEvent;
  interval: IInterval;
  startDate: string;
  endDate: string;
  projectId: string;
  timezone: string;
};

export type AggregateChartQueryInput = ResolvedChartBreakdowns & {
  event: ChartQueryEvent;
  startDate: string;
  endDate: string;
  projectId: string;
  limit?: number;
};

type Parts = Record<string, SqlFragment>;

export class ChartCohortIdError extends Error {
  constructor(cohortId: string) {
    super(`Refusing to inline cohort id ${JSON.stringify(cohortId)}`);
    this.name = 'ChartCohortIdError';
  }
}

function assertCohortId(cohortId: string): string {
  if (!COHORT_ID_PATTERN.test(cohortId)) {
    throw new ChartCohortIdError(cohortId);
  }
  return cohortId;
}

// --- breakdown resolution ---------------------------------------------------

/**
 * Drop breakdowns whose field name doesn't resolve to a known events column,
 * properties path, profile path, group path, or cohort — saved reports with
 * fields like `temple_name` (a property, not a column) reached ClickHouse as
 * `SELECT temple_name ...`, failing parse.
 */
export function knownBreakdowns(
  breakdowns: IChartBreakdown[]
): IChartBreakdown[] {
  return breakdowns.filter((breakdown) => isKnownEventField(breakdown.name));
}

export function requestsAllCohortsBreakdown(
  breakdowns: IChartBreakdown[]
): boolean {
  return breakdowns.some((breakdown) => isAllCohortsBreakdown(breakdown.name));
}

/**
 * Drop the all-cohorts breakdown when the project has no cohorts: its label
 * collapses to the literal 'Unknown', which ClickHouse rejects as a join key
 * ("Cannot determine join keys").
 */
export function withoutEmptyAllCohortsBreakdown(
  breakdowns: IChartBreakdown[],
  allCohorts: CohortMetadata[]
): IChartBreakdown[] {
  if (allCohorts.length > 0) {
    return breakdowns;
  }
  return breakdowns.filter(
    (breakdown) => !isAllCohortsBreakdown(breakdown.name)
  );
}

// --- clause rendering -------------------------------------------------------

function clauses(parts: Parts): SqlFragment[] {
  return Object.values(parts);
}

function withClause(ctes: Parts): SqlFragment {
  const entries = Object.entries(ctes);
  if (entries.length === 0) {
    return sql.empty;
  }
  const cteClauses = entries.map(
    ([name, query]) => sql`${compiledText(name)} AS (${query})`
  );
  return sql`WITH ${sql.join(cteClauses, ', ')} `;
}

function selectClause(select: Parts): SqlFragment {
  return sql`SELECT ${sql.join(clauses(select), ', ')}`;
}

function joinsClause(joins: Parts): SqlFragment {
  return sql.join(clauses(joins), ' ');
}

function whereClause(where: Parts): SqlFragment {
  const conditions = clauses(where);
  if (conditions.length === 0) {
    return sql.empty;
  }
  return sql`WHERE ${sql.join(conditions, ' AND ')}`;
}

function groupByClause(groupBy: Parts): SqlFragment {
  const keys = clauses(groupBy);
  if (keys.length === 0) {
    return sql.empty;
  }
  return sql`GROUP BY ${sql.join(keys, ', ')}`;
}

function orderByClause(orderBy: Parts): SqlFragment {
  const keys = clauses(orderBy);
  if (keys.length === 0) {
    return sql.empty;
  }
  return sql`ORDER BY ${sql.join(keys, ', ')}`;
}

// --- shared chart body ------------------------------------------------------

function profileCteSelectField(
  field: string,
  profileKeys: string[],
  needsFullMap: boolean
): SqlFragment {
  if (field === 'properties') {
    return profilePropertiesCteSelect(profileKeys, needsFullMap);
  }
  // The alias is `"profile.<field>"` — two dots, so text, not `sql.id`.
  // `collectProfileCteFields` only ever yields a name from its own closed set.
  return sql`${sql.id(field, PROFILE_CTE_FIELDS)} as ${compiledText(`"profile.${field}"`)}`;
}

function profileCte(
  selectFields: SqlFragment[],
  projectId: string
): SqlFragment {
  return sql`SELECT ${sql.join(selectFields, ', ')}
      FROM ${sql.id(CHART_TABLE.profiles)} FINAL
      WHERE project_id = ${sql.string(projectId)}`;
}

function anyRefOn(prefix: string, refs: { name: string }[]): boolean {
  return refs.some((ref) => ref.name.startsWith(prefix));
}

interface ChartBody {
  ctes: Parts;
  joins: Parts;
  where: Parts;
  select: Parts;
  profileKeys: string[];
}

/**
 * The CTEs, JOINs, WHERE and `label_0` both chart shapes share, in V1's
 * clause order: cohort CTEs/joins, filters + project + event name, group
 * ARRAY JOIN, profile CTE.
 */
function chartBody({
  event,
  breakdowns,
  allCohorts,
  projectId,
}: {
  event: ChartQueryEvent;
  breakdowns: IChartBreakdown[];
  allCohorts: CohortMetadata[];
  projectId: string;
}): ChartBody {
  const hasAllCohortsBreakdown =
    requestsAllCohortsBreakdown(breakdowns) && allCohorts.length > 0;
  const cohortIds = collectBreakdownCohortIds(breakdowns).map(assertCohortId);

  const metricRef = event.property ? [{ name: event.property }] : [];
  // Math metrics reference event.property too — missing it here would strip
  // the Map the metric still reads from.
  const profileProps = collectProfilePropertyKeys([
    ...event.filters,
    ...breakdowns,
    ...metricRef,
  ]);
  const ctes: Parts = {};
  const joins: Parts = {};

  if (hasAllCohortsBreakdown) {
    ctes[ALL_COHORTS_ALIAS] = buildAllCohortsMembershipQuery(projectId);
    joins[ALL_COHORTS_ALIAS] =
      sql`INNER JOIN _all_cohorts ON _all_cohorts.profile_id = e.profile_id`;
  }

  for (const cohortId of cohortIds) {
    const cteName = `\`cohort-${cohortId}\``;
    const alias = getCohortAlias(cohortId);
    ctes[cteName] = buildCohortMembershipQuery(cohortId, projectId);
    joins[`cohort_${cohortId}`] =
      sql`LEFT ANY JOIN ${compiledText(cteName)} AS ${sql.id(alias)} ON ${sql.id(`${alias}.profile_id`)} = e.profile_id`;
  }

  const where: Parts = {};
  const compiledFilters = getEventFiltersWhereClause(
    event.filters,
    projectId,
    EVENTS_ALIAS
  );
  for (const [key, clause] of Object.entries(compiledFilters)) {
    where[key] = fragmentWithProfileRefs(clause, profileProps.keys);
  }
  where.projectId = sql`project_id = ${sql.string(projectId)}`;

  const select: Parts = {};
  if (event.name !== '*') {
    select.label_0 = sql`${sql.string(event.name)} as label_0`;
    where.eventName = sql`e.name = ${sql.string(event.name)}`;
  } else {
    select.label_0 = sql`'*' as label_0`;
  }

  const profileRefs = [...event.filters, ...breakdowns, ...metricRef];
  const needsProfileJoin = anyRefOn('profile.', profileRefs);
  const needsGroupArrayJoin =
    anyRefOn('group.', profileRefs) || event.segment === 'group';

  if (needsGroupArrayJoin) {
    ctes._g = buildGroupsQuery(projectId);
    joins.groups = sql`ARRAY JOIN groups AS _group_id`;
    joins.groups_table = sql`LEFT ANY JOIN _g ON _g.id = _group_id`;
  }

  if (needsProfileJoin) {
    const selectFields = collectProfileCteFields(profileRefs).map((field) =>
      profileCteSelectField(field, profileProps.keys, profileProps.needsFullMap)
    );
    ctes.profile = profileCte(selectFields, projectId);
    joins.profiles = sql`LEFT ANY JOIN profile ON profile.id = profile_id`;
  }

  return {
    ctes,
    joins,
    where,
    select,
    profileKeys: profileProps.keys,
  };
}

function breakdownLabel(
  breakdown: IChartBreakdown,
  {
    allCohorts,
    cohortMetadata,
    projectId,
    profileKeys,
  }: Pick<
    ChartSeriesQueryInput,
    'allCohorts' | 'cohortMetadata' | 'projectId'
  > &
    Pick<ChartBody, 'profileKeys'>
): SqlFragment {
  if (isAllCohortsBreakdown(breakdown.name)) {
    return buildAllCohortsLabelExpr(allCohorts, ALL_COHORTS_ALIAS);
  }
  const cohortId = extractCohortId(breakdown.name);
  if (cohortId) {
    return cohortBreakdownLabelExpr(
      assertCohortId(cohortId),
      cohortMetadata.get(cohortId)?.name
    );
  }
  return fragmentWithProfileRefs(
    getSelectPropertyKey(
      breakdown.name,
      projectId,
      undefined,
      undefined,
      EVENTS_ALIAS
    ),
    profileKeys
  );
}

function addBreakdownLabels(
  input: ChartSeriesQueryInput | AggregateChartQueryInput,
  body: ChartBody,
  groupBy: Parts
): void {
  // Breakdowns start at label_1 (label_0 is reserved for event name).
  input.breakdowns.forEach((breakdown, index) => {
    const key = `label_${index + 1}`;
    const label = breakdownLabel(breakdown, {
      ...input,
      profileKeys: body.profileKeys,
    });
    body.select[key] = sql`${label} as ${compiledText(key)}`;
    groupBy[key] = compiledText(key);
  });
}

function countExpression(
  event: ChartQueryEvent,
  body: ChartBody,
  /** V1's aggregate shape resolved the metric property against the project; the series shape did not. */
  metricProjectId: string | undefined
): SqlFragment {
  if (event.segment === 'user') {
    return sql`countDistinct(profile_id) as count`;
  }
  if (event.segment === 'session') {
    return sql`countDistinct(session_id) as count`;
  }
  if (event.segment === 'group') {
    return sql`countDistinct(_group_id) as count`;
  }
  if (event.segment === 'user_average') {
    return sql`COUNT(*)::float / COUNT(DISTINCT profile_id)::float as count`;
  }
  const mathFunction = MATH_FUNCTION_BY_SEGMENT[event.segment];
  if (mathFunction && event.property) {
    const propertyKey = fragmentWithProfileRefs(
      getSelectPropertyKey(
        event.property,
        metricProjectId,
        undefined,
        undefined,
        EVENTS_ALIAS
      ),
      body.profileKeys
    );
    const aggregate = compiledText(mathFunction);
    if (isNumericColumn(event.property)) {
      body.where.property = sql`${propertyKey} IS NOT NULL`;
      return sql`${aggregate}(${propertyKey}) as count`;
    }
    body.where.property = sql`${propertyKey} IS NOT NULL AND notEmpty(${propertyKey})`;
    return sql`${aggregate}(toFloat64OrNull(${propertyKey})) as count`;
  }
  return sql`count(*) as count`;
}

function oneEventPerUserFrom(body: ChartBody): SqlFragment {
  return sql`(
      SELECT DISTINCT ON (profile_id) * from ${sql.id(CHART_TABLE.events)} e ${joinsClause(body.joins)} WHERE ${sql.join(clauses(body.where), ' AND ')}
        ORDER BY profile_id, created_at DESC
      ) as subQuery`;
}

function dateRangeWhere(
  where: Parts,
  startDate: string,
  endDate: string
): void {
  if (startDate) {
    where.startDate = sql`created_at >= toDateTime(${sql.string(formatClickhouseDate(startDate))})`;
  }
  if (endDate) {
    where.endDate = sql`created_at <= toDateTime(${sql.string(formatClickhouseDate(endDate))})`;
  }
}

// --- series chart -----------------------------------------------------------

function intervalBucket(
  interval: IInterval,
  timezone: string
): { select: SqlFragment; fill: (start: string, end: string) => SqlFragment } {
  const tz = sql.string(timezone);
  switch (interval) {
    case 'minute':
      return {
        select: sql`toStartOfMinute(created_at) as date`,
        fill: (start, end) =>
          sql`FROM toStartOfMinute(toDateTime(${sql.string(start)})) TO toStartOfMinute(toDateTime(${sql.string(end)})) STEP toIntervalMinute(1)`,
      };
    case 'hour':
      return {
        select: sql`toStartOfHour(created_at) as date`,
        fill: (start, end) =>
          sql`FROM toStartOfHour(toDateTime(${sql.string(start)})) TO toStartOfHour(toDateTime(${sql.string(end)})) STEP toIntervalHour(1)`,
      };
    case 'day':
      return {
        select: sql`toStartOfDay(created_at) as date`,
        fill: (start, end) =>
          sql`FROM toStartOfDay(toDateTime(${sql.string(start)})) TO toStartOfDay(toDateTime(${sql.string(end)})) STEP toIntervalDay(1)`,
      };
    case 'week':
      return {
        select: sql`toStartOfWeek(created_at, 1, ${tz}) as date`,
        fill: (start, end) =>
          sql`FROM toStartOfWeek(toDateTime(${sql.string(start)}), 1, ${tz}) TO toStartOfWeek(toDateTime(${sql.string(end)}), 1, ${tz}) STEP toIntervalWeek(1)`,
      };
    case 'month':
      return {
        select: sql`toStartOfMonth(created_at, ${tz}) as date`,
        fill: (start, end) =>
          sql`FROM toStartOfMonth(toDateTime(${sql.string(start)}), ${tz}) TO toStartOfMonth(toDateTime(${sql.string(end)}), ${tz}) STEP toIntervalMonth(1)`,
      };
    default:
      throw new Error(`Unsupported chart interval: ${String(interval)}`);
  }
}

/** V1 `getChartSql`: one series, bucketed by interval, with a windowed unique total. */
export function chartSeriesQuery(input: ChartSeriesQueryInput): SqlFragment {
  const { event, interval, startDate, endDate, timezone } = input;
  const body = chartBody(input);
  const groupBy: Parts = {};
  const orderBy: Parts = {};

  body.select.count = sql`count(*) as count`;
  const bucket = intervalBucket(interval, timezone);
  // ClickHouse rejects WITH FILL when TO < FROM, so only emit a fill clause
  // for a valid range. The SELECT bucket truncation is always safe.
  const hasValidFillRange =
    !!startDate && !!endDate && new Date(endDate) >= new Date(startDate);
  const fill = hasValidFillRange
    ? sql`WITH FILL ${bucket.fill(startDate, endDate)}`
    : sql.empty;
  body.select.date = bucket.select;
  groupBy.date = sql`date`;
  orderBy.date = sql`date ASC`;

  dateRangeWhere(body.where, startDate, endDate);
  addBreakdownLabels(input, body, groupBy);
  body.select.count = countExpression(event, body, undefined);

  if (event.segment === 'one_event_per_user') {
    // Filters were applied inside the subquery and the `e` alias is out of
    // scope outside it, so neither joins nor WHERE are re-emitted.
    const from = oneEventPerUserFrom(body);
    return sql`${withClause(body.ctes)}${selectClause(body.select)} FROM ${from}   ${groupByClause(groupBy)} ${orderByClause(orderBy)} ${fill}`;
  }

  // Single-pass total_count: aggregate uniqState(profile_id) alongside the
  // series in the same scan, then merge the per-group states with a window
  // aggregate in an outer select — PARTITION BY the breakdown labels, or an
  // empty partition for the global total.
  body.select.uc_state = sql`uniqState(profile_id) as _uc_state`;
  const partition = input.breakdowns.map((_, index) =>
    compiledText(`label_${index + 1}`)
  );
  const totalCount =
    partition.length > 0
      ? sql`uniqMerge(_uc_state) OVER (PARTITION BY ${sql.join(partition, ', ')}) as total_count`
      : sql`uniqMerge(_uc_state) OVER () as total_count`;

  return sql`${withClause(body.ctes)}SELECT * EXCEPT (_uc_state), ${totalCount} FROM (${selectClause(body.select)} FROM ${sql.id(CHART_TABLE.events)} e ${joinsClause(body.joins)} ${whereClause(body.where)} ${groupByClause(groupBy)}) ${orderByClause(orderBy)} ${fill}`;
}

// --- aggregate chart --------------------------------------------------------

/** V1 `getAggregateChartSql`: one row per breakdown combination over the whole range. */
export function aggregateChartQuery(
  input: AggregateChartQueryInput
): SqlFragment {
  const { event, startDate, endDate, projectId, limit } = input;
  const body = chartBody(input);
  const groupBy: Parts = {};
  const orderBy: Parts = {};

  dateRangeWhere(body.where, startDate, endDate);
  // A constant date field: groupByLabels expects one, and the whole range
  // aggregates into it.
  body.select.date = sql`${sql.string(startDate)} as date`;
  addBreakdownLabels(input, body, groupBy);
  groupBy.label_0 = sql`label_0`;
  body.select.count = countExpression(event, body, projectId);

  const head = sql`${withClause(body.ctes)}${selectClause(body.select)}`;

  if (event.segment === 'one_event_per_user') {
    // V1 re-emitted its WHERE after the subquery here (unlike the series
    // shape); kept as is — converting a query is not the place to change it.
    const from = oneEventPerUserFrom(body);
    return sql`${head} FROM ${from} ${whereClause(body.where)} ${groupByClause(groupBy)}`;
  }

  orderBy.count = sql`count DESC`;
  const limitClause = limit ? sql`LIMIT ${sql.uint64(limit)}` : sql.empty;
  return sql`${head} FROM ${sql.id(CHART_TABLE.events)} e ${joinsClause(body.joins)} ${whereClause(body.where)} ${groupByClause(groupBy)} ${orderByClause(orderBy)} ${limitClause}`;
}

// --- router queries ---------------------------------------------------------

/**
 * projectCard: three months of daily unique visitors + revenue, filled.
 * The timezone travels as `clickhouse_settings.session_timezone` (the caller
 * passes it) instead of V1's inline `SETTINGS` clause — same setting, same
 * query scope, and a bindable position.
 */
export function projectCardChartQuery(projectId: string): SqlFragment {
  return sql`SELECT
            uniqHLL12(profile_id) as value,
            toStartOfDay(created_at) as date,
            sum(revenue * sign) as revenue
        FROM ${sql.id(CHART_TABLE.sessions)}
        WHERE
            project_id = ${sql.string(projectId)} AND
            created_at >= now() - interval '3 month'
        GROUP BY date
        ORDER BY date ASC
        WITH FILL FROM toStartOfDay(now() - interval '3 month')
        TO toStartOfDay(now())
        STEP INTERVAL 1 day`;
}

/** projectCard: rolling 3-month / 1-month / 1-day unique visitors and revenue. */
export function projectCardMetricsQuery(projectId: string): SqlFragment {
  return sql`SELECT uniqHLL12(if(created_at >= (now() - toIntervalMonth(3)), profile_id, null)) AS months_3, uniqHLL12(if(created_at >= (now() - toIntervalMonth(6)) AND created_at < (now() - toIntervalMonth(3)), profile_id, null)) AS months_3_prev, uniqHLL12(if(created_at >= (now() - toIntervalMonth(1)), profile_id, null)) AS month, uniqHLL12(if(created_at >= (now() - toIntervalDay(1)), profile_id, null)) AS day, uniqHLL12(if(created_at >= (now() - toIntervalDay(2)) AND created_at < (now() - toIntervalDay(1)), profile_id, null)) AS day_prev, sum(revenue * sign) as revenue FROM ${sql.id(CHART_TABLE.sessions)} WHERE project_id = ${sql.string(projectId)} AND created_at >= (now() - toIntervalMonth(6))`;
}

export function eventNamesWithCountQuery(projectId: string): SqlFragment {
  return sql`SELECT name, count(name) as count FROM ${sql.id(CHART_TABLE.eventNamesMv)} WHERE project_id = ${sql.string(projectId)} GROUP BY name ORDER BY count DESC, name ASC`;
}

function optionalEventName(event: string | undefined): SqlFragment {
  return event && event !== '*'
    ? sql` AND name = ${sql.string(event)}`
    : sql.empty;
}

export function eventPropertyKeysQuery(
  projectId: string,
  event: string | undefined,
  limit: number
): SqlFragment {
  return sql`SELECT distinct property_key, max(created_at) as created_at FROM ${sql.id(CHART_TABLE.eventPropertyValuesMv)} WHERE project_id = ${sql.string(projectId)}${optionalEventName(event)} GROUP BY property_key ORDER BY created_at DESC, property_key ASC LIMIT ${sql.uint64(limit)}`;
}

export function eventPropertyValuesQuery(
  projectId: string,
  propertyKey: string,
  event: string | undefined,
  limit: number
): SqlFragment {
  return sql`SELECT distinct property_value, max(created_at) as created_at FROM ${sql.id(CHART_TABLE.eventPropertyValuesMv)} WHERE project_id = ${sql.string(projectId)} AND property_key = ${sql.string(propertyKey)}${optionalEventName(event)} GROUP BY property_value ORDER BY created_at DESC, property_value ASC LIMIT ${sql.uint64(limit)}`;
}

/** Distinct values of a `profile.*` field straight off the profiles table. */
export function profilePropertyValuesQuery(
  projectId: string,
  expression: SqlFragment
): SqlFragment {
  return sql`SELECT distinct ${expression} as values FROM ${sql.id(CHART_TABLE.profiles)} FINAL WHERE project_id = ${sql.string(projectId)} AND ${expression} != '' AND ${expression} IS NOT NULL ORDER BY created_at DESC LIMIT ${sql.uint64(PROPERTY_VALUES_LIMIT)}`;
}

/** Distinct values of a `group.*` field straight off the groups table. */
export function groupPropertyValuesQuery(
  projectId: string,
  expression: SqlFragment
): SqlFragment {
  return sql`SELECT distinct ${expression} as values FROM ${sql.id(CHART_TABLE.groups)} FINAL WHERE project_id = ${sql.string(projectId)} AND deleted = 0 AND ${expression} != '' AND ${expression} IS NOT NULL ORDER BY created_at DESC LIMIT ${sql.uint64(PROPERTY_VALUES_LIMIT)}`;
}

/** Distinct values of an events column / property over the last six months. */
export function eventFieldValuesQuery(
  projectId: string,
  selectExpression: SqlFragment,
  event: string
): SqlFragment {
  // V1 only skipped the name clause for `*` — an empty event name filters on ''.
  const eventName =
    event !== '*' ? sql` AND name = ${sql.string(event)}` : sql.empty;
  return sql`SELECT distinct ${selectExpression} as values FROM ${sql.id(CHART_TABLE.events)} WHERE project_id = ${sql.string(projectId)} AND created_at > (now() - INTERVAL 6 MONTH)${eventName} ORDER BY created_at DESC LIMIT ${sql.uint64(PROPERTY_VALUES_LIMIT)}`;
}

// --- getProfiles ------------------------------------------------------------

export interface ChartBucketProfilesInput {
  projectId: string;
  /** Bucket start as V1's `YYYY-MM-DD HH:mm:ss` string. */
  bucketDate: string;
  interval: IInterval;
  event: Pick<IChartEvent, 'name' | 'filters'>;
  breakdowns: Record<string, string>;
}

function bucketEquals(interval: IInterval, bucketDate: string): SqlFragment {
  const date = sql.string(bucketDate);
  switch (interval) {
    case 'minute':
      return sql`toStartOfMinute(created_at) = toDateTime(${date})`;
    case 'hour':
      return sql`toStartOfHour(created_at) = toDateTime(${date})`;
    case 'day':
      return sql`toStartOfDay(created_at) = toDate(${date})`;
    case 'week':
      return sql`toStartOfWeek(toDateTime(created_at)) = toDate(${date})`;
    case 'month':
      return sql`toStartOfMonth(toDateTime(created_at)) = toDate(${date})`;
    default:
      throw new Error(`Unsupported chart interval: ${String(interval)}`);
  }
}

/** Top-level profile columns a `profile.*` reference reads, in first-seen order. */
function profileFieldsToSelect(refs: string[]): SqlFragment[] {
  const fields: string[] = [];
  for (const ref of refs) {
    const field = ref.replace('profile.', '').split('.')[0];
    if (field && !fields.includes(field)) {
      fields.push(field);
    }
  }
  // ADR-013 R3: V1 spliced these unchecked (trpc chart.ts:781).
  return fields.map((field) => sql.id(field, PROFILE_COLUMNS));
}

/** Distinct profile ids behind one chart data point (V1 `getProfiles`). */
export function chartBucketProfilesQuery(
  input: ChartBucketProfilesInput
): SqlFragment {
  const { projectId, event, interval, bucketDate, breakdowns } = input;
  const breakdownKeys = Object.keys(breakdowns);

  const where: Parts = {};
  for (const [key, clause] of Object.entries(
    getEventFiltersWhereClause(event.filters, projectId)
  )) {
    where[key] = clause;
  }
  where.projectId = sql`project_id = ${sql.string(projectId)}`;
  where.dateRange = bucketEquals(interval, bucketDate);
  if (event.name !== '*') {
    where.eventName = sql`name = ${sql.string(event.name)}`;
  }

  const joins: Parts = {};
  const profileRefs = [
    ...event.filters.map((filter) => filter.name),
    ...breakdownKeys,
  ].filter((name) => name.startsWith('profile.'));
  if (profileRefs.length > 0) {
    const fields = sql.join(profileFieldsToSelect(profileRefs), ', ');
    joins.profiles = sql`LEFT ANY JOIN (SELECT id, ${fields} FROM ${sql.id(CHART_TABLE.profiles)} FINAL WHERE project_id = ${sql.string(projectId)}) as profile on profile.id = profile_id`;
  }

  const needsGroupJoin = [
    ...event.filters.map((filter) => filter.name),
    ...breakdownKeys,
  ].some((name) => name.startsWith('group.'));
  if (needsGroupJoin) {
    joins.groups = sql`ARRAY JOIN groups AS _group_id`;
    joins.groups_cte = sql`LEFT ANY JOIN (${buildGroupsQuery(projectId)}) AS _g ON _g.id = _group_id`;
  }

  for (const [key, value] of Object.entries(breakdowns)) {
    const propertyKey = getSelectPropertyKey(key, projectId);
    where[`breakdown_${key}`] = sql`${propertyKey} = ${sql.string(value)}`;
  }

  return sql`SELECT DISTINCT profile_id FROM ${sql.id(CHART_TABLE.events)} e ${joinsClause(joins)} ${whereClause(where)}`;
}
