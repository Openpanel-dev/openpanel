/** biome-ignore-all lint/style/useDefaultSwitchClause: switch cases are exhaustive by design */
// The filter compiler for the sessions/profiles/events tables — distinct from
// `./filter-where.ts`'s `getEventFiltersWhereClause`, which compiles
// event-property filters. Every VALUE binds as a `{name:Type}` param; every
// identifier goes through `sql.id` or a static fragment.
//
// Cluster note: `events`, `profiles`, `groups` and `cohort_members` are
// Distributed on Cloud. The cohort / profile / group / performed_event
// subselects use plain `IN`.

import { type SqlFragment, sql } from '@openpanel/db/src/clickhouse/sql';
import {
  getCohortIds,
  type IChartEventFilter,
  type IChartEventFilterValue,
  type IChartFilterValueType,
} from '../../report/report.constants';
import { PROFILE_SELECT_COLUMNS } from '../chart.constants';
import { formatClickhouseDate } from './dates';
import { buildCohortMembersSubselect, CHART_TABLE } from './field-resolution';
import {
  buildTypedClauseFragment,
  hasTypedCast,
  isTypedOperator,
} from './filter-cast';

export interface FilterTableContext {
  /** Outer query's primary table. */
  selfTable: 'sessions' | 'profiles' | 'events';
  /**
   * Expression on the outer row that yields the owning profile id. For the
   * profiles table this is `id`; for events/sessions it's `profile_id`. Used
   * by cohort + cross-table profile.* filters.
   */
  profileIdExpr: string;
  /**
   * Expression on the outer row that yields the array of group ids. All three
   * canonical tables expose a `groups Array(String)` column today.
   */
  groupsExpr?: string;
  /**
   * Optional date scope passed to subselects that reference the events table
   * (currently only `session.performed_event`). Without it ClickHouse has to
   * scan the entire event history for the project.
   */
  startDate?: Date;
  endDate?: Date;
}

/** One clause per surviving filter, keyed `f<index>`. */
export type CompiledTableFilters = Record<string, SqlFragment>;

/** Sentinel sessions columns that the UI may filter on directly. */
const SESSION_NUMERIC_COLUMNS = new Set([
  'screen_view_count',
  'event_count',
  'duration',
  'revenue',
]);

/** What `sessionColumnName` can return — `sql.id`'s closed set. */
const SESSION_FILTER_COLUMNS = ['is_bounce', ...SESSION_NUMERIC_COLUMNS];

/**
 * The type ClickHouse infers for an integer literal, narrowest first: `5` is
 * UInt8, `300` UInt16, `-5` Int8. Ordered so the first row whose range
 * contains the value wins; a negative value never matches an unsigned row and
 * vice versa.
 */
const INTEGER_LITERAL_TYPES = [
  { min: 0n, limit: 2n ** 8n, type: 'UInt8' },
  { min: 0n, limit: 2n ** 16n, type: 'UInt16' },
  { min: 0n, limit: 2n ** 32n, type: 'UInt32' },
  { min: 0n, limit: 2n ** 64n, type: 'UInt64' },
  { min: -(2n ** 7n), limit: 0n, type: 'Int8' },
  { min: -(2n ** 15n), limit: 0n, type: 'Int16' },
  { min: -(2n ** 31n), limit: 0n, type: 'Int32' },
  { min: -(2n ** 63n), limit: 0n, type: 'Int64' },
] as const;

/** Everything the table above does not cover — fractions and huge magnitudes. */
const NON_INTEGER_LITERAL_TYPE = 'Float64';

const INTEGER_LITERAL_TEXT = /^-?\d+$/;

/**
 * The integer ClickHouse would parse out of the number's text form, or null
 * when that text is not an integer literal — a fraction, or a magnitude large
 * enough that `String` switches to exponent notation.
 */
function integerLiteralDigits(value: number): bigint | null {
  const text = String(value);
  return INTEGER_LITERAL_TEXT.test(text) ? BigInt(text) : null;
}

/**
 * An inlined numeric filter value lets ClickHouse infer the literal's type;
 * a bound param has to declare one, so declare the type that literal would
 * have had. Declaring `Float64` for every number would bind a *different constant*
 * — visible wherever the comparand's type takes part in type resolution, and
 * in the `NO_COMMON_TYPE` message when a numeric filter lands on a String
 * property (the proof's two error cases).
 *
 * `filter-cast.ts`'s twin needs none of this: there every value is wrapped in
 * `toFloat64OrNull(toString(…))` or a sibling cast, which erases the declared
 * type before anything else can observe it.
 */
function numericLiteralType(value: number): string {
  const digits = integerLiteralDigits(value);
  const fit =
    digits === null
      ? undefined
      : INTEGER_LITERAL_TYPES.find(
          ({ min, limit }) => digits >= min && digits < limit
        );
  return fit?.type ?? NON_INTEGER_LITERAL_TYPE;
}

/**
 * Bind one filter value the way `sqlstring.escape` rendered it: a string is a
 * trimmed quoted literal, a number a numeric literal of the type ClickHouse
 * would have inferred for it, a boolean `true`/`false` and `null` the SQL
 * keyword NULL — which only `Nullable` reproduces, since a `String` param
 * bound to null arrives as the empty string.
 */
function valueParam(value: IChartEventFilterValue) {
  if (value === null) {
    return sql.nullable('String', null);
  }
  if (typeof value === 'number') {
    return sql.param(numericLiteralType(value), value);
  }
  if (typeof value === 'boolean') {
    return sql.bool(value);
  }
  return sql.string(value.trim());
}

/** What a LIKE pattern is built from. */
function trimVal(value: IChartEventFilterValue): string {
  return typeof value === 'string' ? value.trim() : String(value);
}

/** Every value as one `Array(String)`, for the `IN` / `NOT IN` branches. */
function valueArray(value: IChartEventFilterValue[]) {
  return sql.array('String', value.map(trimVal));
}

/** `(<a> OR <b>)` / `(<a> AND <b>)` — the parenthesised join. */
function joined(clauses: SqlFragment[], separator: ' OR ' | ' AND ') {
  return sql`(${sql.join(clauses, separator)})`;
}

/**
 * Build a WHERE-clause fragment for a single non-array column. Mirrors the
 * operator set used by `getEventFiltersWhereClause` so behaviour stays
 * consistent across surfaces.
 */
function compileScalarClause(
  column: SqlFragment,
  operator: IChartEventFilter['operator'],
  value: IChartEventFilter['value'],
  options: { numeric?: boolean; type?: IChartFilterValueType } = {}
): SqlFragment | null {
  if (value.length === 0 && operator !== 'isNull' && operator !== 'isNotNull') {
    return null;
  }

  // Explicit cast type wins over the column-name `numeric` auto-detect. Casts
  // both the column and each value consistently (see filter-cast.ts).
  if (hasTypedCast(options.type) && isTypedOperator(operator)) {
    return buildTypedClauseFragment(column, operator, value, options.type!);
  }

  const numeric = options.numeric === true;
  // Both sides are wrapped in toFloat64 on a numeric column; the quoted
  // comparand fed to toFloat64 is the behaviour, so the value stays a String.
  const left = numeric ? sql`toFloat64(${column})` : column;
  const right = (val: IChartEventFilterValue) =>
    numeric ? sql`toFloat64(${valueParam(val)})` : valueParam(val);

  switch (operator) {
    case 'is': {
      if (numeric) {
        return joined(
          value.map((v) => sql`${left} = ${right(v)}`),
          ' OR '
        );
      }
      if (value.length === 1) {
        return sql`${column} = ${valueParam(value[0]!)}`;
      }
      return sql`${column} IN ${valueArray(value)}`;
    }
    case 'isNot': {
      if (numeric) {
        return joined(
          value.map((v) => sql`${left} != ${right(v)}`),
          ' OR '
        );
      }
      if (value.length === 1) {
        return sql`${column} != ${valueParam(value[0]!)}`;
      }
      return sql`${column} NOT IN ${valueArray(value)}`;
    }
    case 'contains': {
      return joined(
        value.map((v) => sql`${column} ILIKE ${sql.string(`%${trimVal(v)}%`)}`),
        ' OR '
      );
    }
    case 'doesNotContain': {
      return joined(
        value.map(
          (v) => sql`${column} NOT ILIKE ${sql.string(`%${trimVal(v)}%`)}`
        ),
        ' AND '
      );
    }
    case 'startsWith': {
      return joined(
        value.map((v) => sql`${column} ILIKE ${sql.string(`${trimVal(v)}%`)}`),
        ' OR '
      );
    }
    case 'endsWith': {
      return joined(
        value.map((v) => sql`${column} ILIKE ${sql.string(`%${trimVal(v)}`)}`),
        ' OR '
      );
    }
    case 'regex': {
      return joined(
        value.map((v) => sql`match(${column}, ${valueParam(v)})`),
        ' OR '
      );
    }
    case 'isNull':
      return sql`(${column} = '' OR ${column} IS NULL)`;
    case 'isNotNull':
      return sql`(${column} != '' AND ${column} IS NOT NULL)`;
    case 'gt':
      return joined(
        value.map((v) => sql`${left} > ${right(v)}`),
        ' OR '
      );
    case 'lt':
      return joined(
        value.map((v) => sql`${left} < ${right(v)}`),
        ' OR '
      );
    case 'gte':
      return joined(
        value.map((v) => sql`${left} >= ${right(v)}`),
        ' OR '
      );
    case 'lte':
      return joined(
        value.map((v) => sql`${left} <= ${right(v)}`),
        ' OR '
      );
  }

  return null;
}

/** Group fields that are columns rather than a `properties` lookup. */
const GROUP_COLUMNS = ['name', 'type', 'id'];

/**
 * Translate `profile.<field>` into the SQL accessor used when querying the
 * profiles table directly. Bare fields (email, first_name, …) map to columns;
 * `profile.properties.<key>` maps to the JSON `properties[key]` lookup.
 * Returns null for a field that is neither, so the caller can drop the filter.
 */
function profileColumnSql(name: string): SqlFragment | null {
  const withoutPrefix = name.replace(/^profile\./, '');
  if (withoutPrefix.startsWith('properties.')) {
    const key = withoutPrefix.replace(/^properties\./, '');
    return sql`properties[${sql.string(key)}]`;
  }
  if (PROFILE_SELECT_COLUMNS.includes(withoutPrefix)) {
    return sql.id(withoutPrefix, PROFILE_SELECT_COLUMNS);
  }
  return null;
}

/**
 * Translate `group.<field>` into the SQL accessor used when querying the
 * groups table directly (no join alias).
 */
function groupColumnSql(name: string): SqlFragment {
  const withoutPrefix = name.replace(/^group\./, '');
  if (GROUP_COLUMNS.includes(withoutPrefix)) {
    return sql.id(withoutPrefix, GROUP_COLUMNS);
  }
  if (withoutPrefix.startsWith('properties.')) {
    const key = withoutPrefix.replace(/^properties\./, '');
    return sql`properties[${sql.string(key)}]`;
  }
  return sql`id`;
}

/** Translate `session.<field>` to the underlying sessions column. */
function sessionColumnName(name: string): string | null {
  const withoutPrefix = name.replace(/^session\./, '');
  if (withoutPrefix === 'is_bounce') {
    return 'is_bounce';
  }
  if (SESSION_NUMERIC_COLUMNS.has(withoutPrefix)) {
    return withoutPrefix;
  }
  // performed_event is handled as a subselect, not a column
  return null;
}

function buildCohortClause(
  filter: IChartEventFilter,
  projectId: string,
  ctx: FilterTableContext
): SqlFragment | null {
  // `getCohortIds` normalizes the legacy single-value `cohortId` field and
  // the newer `cohortIds` array into one list. Falls back to extracting the
  // id from the `cohort:<id>` filter name when neither is set (older URL
  // formats encoded the id only in the name).
  let cohortIds = getCohortIds(filter);
  if (cohortIds.length === 0 && filter.name.startsWith('cohort:')) {
    cohortIds = [filter.name.slice('cohort:'.length)];
  }
  if (cohortIds.length === 0) {
    return null;
  }
  const profileId = sql.id(ctx.profileIdExpr);
  const members = buildCohortMembersSubselect(cohortIds, projectId);
  return filter.operator === 'notInCohort'
    ? sql`${profileId} NOT IN ${members}`
    : sql`${profileId} IN ${members}`;
}

function buildGroupClause(
  filter: IChartEventFilter,
  projectId: string,
  ctx: FilterTableContext
): SqlFragment | null {
  if (!ctx.groupsExpr) {
    return null;
  }
  const column = groupColumnSql(filter.name);
  const inner = compileScalarClause(column, filter.operator, filter.value, {
    type: filter.type,
  });
  if (!inner) {
    return null;
  }
  return sql`arrayExists(g -> g IN (SELECT id FROM ${sql.id(CHART_TABLE.groups)} FINAL WHERE project_id = ${sql.string(projectId)} AND ${inner}), ${sql.id(ctx.groupsExpr)})`;
}

function buildProfileClause(
  filter: IChartEventFilter,
  projectId: string,
  ctx: FilterTableContext
): SqlFragment | null {
  const name = filter.name.replace(/^profile\./, '');
  const column = profileColumnSql(filter.name);
  if (!column) {
    return null;
  }
  const numeric = name === 'created_at' || name === 'last_seen_at';
  const inner = compileScalarClause(column, filter.operator, filter.value, {
    numeric,
    type: filter.type,
  });
  if (!inner) {
    return null;
  }
  if (ctx.selfTable === 'profiles') {
    return inner;
  }
  return sql`${sql.id(ctx.profileIdExpr)} IN (SELECT id FROM ${sql.id(CHART_TABLE.profiles)} FINAL WHERE project_id = ${sql.string(projectId)} AND ${inner})`;
}

function buildSessionClause(
  filter: IChartEventFilter,
  projectId: string,
  ctx: FilterTableContext
): SqlFragment | null {
  if (ctx.selfTable !== 'sessions') {
    return null;
  }
  const fieldName = filter.name.replace(/^session\./, '');

  if (fieldName === 'performed_event') {
    if (filter.value.length === 0) {
      return null;
    }
    const nameClause =
      filter.value.length === 1
        ? sql`= ${valueParam(filter.value[0]!)}`
        : sql`IN ${valueArray(filter.value)}`;
    const dateScope =
      ctx.startDate && ctx.endDate
        ? sql`AND toDate(created_at) BETWEEN toDate(${sql.string(formatClickhouseDate(ctx.startDate))}) AND toDate(${sql.string(formatClickhouseDate(ctx.endDate))}) `
        : sql.empty;
    const members = sql`(SELECT DISTINCT session_id FROM ${sql.id(CHART_TABLE.events)} WHERE project_id = ${sql.string(projectId)} ${dateScope}AND name ${nameClause})`;
    return filter.operator === 'isNot'
      ? sql`id NOT IN ${members}`
      : sql`id IN ${members}`;
  }

  if (fieldName === 'is_bounce') {
    if (filter.value.length === 0) {
      return null;
    }
    const wants = filter.value.some((v) =>
      typeof v === 'boolean' ? v : String(v).toLowerCase() === 'true'
    );
    const truthy = filter.operator === 'isNot' ? !wants : wants;
    return truthy ? sql`is_bounce = 1` : sql`is_bounce = 0`;
  }

  const column = sessionColumnName(filter.name);
  if (!column) {
    return null;
  }
  return compileScalarClause(
    sql.id(column, SESSION_FILTER_COLUMNS),
    filter.operator,
    filter.value,
    {
      numeric: SESSION_NUMERIC_COLUMNS.has(column),
      type: filter.type,
    }
  );
}

/**
 * Translate `IChartEventFilter[]` into a WHERE-clause record of bound
 * fragments. Handles cohort / group / profile / session prefixes.
 * Event-property (`properties.*`) filters are ignored on non-events tables —
 * they require a subquery on the events table that is better expressed as a
 * cohort.
 */
export function buildFilterWhere(
  filters: IChartEventFilter[],
  projectId: string,
  ctx: FilterTableContext
): CompiledTableFilters {
  const where: CompiledTableFilters = {};
  filters.forEach((filter, index) => {
    const id = `f${index}`;
    // Callers concatenate these fragments with AND and no grouping, so each
    // fragment is parenthesized here to keep a top-level OR inside it from
    // rebinding the surrounding conditions.
    const set = (clause: SqlFragment | null) => {
      if (clause) {
        where[id] = sql`(${clause})`;
      }
    };

    if (filter.operator === 'inCohort' || filter.operator === 'notInCohort') {
      set(buildCohortClause(filter, projectId, ctx));
      return;
    }

    if (filter.name.startsWith('cohort:')) {
      set(buildCohortClause(filter, projectId, ctx));
      return;
    }

    if (filter.name.startsWith('group.')) {
      set(buildGroupClause(filter, projectId, ctx));
      return;
    }

    if (filter.name.startsWith('profile.')) {
      set(buildProfileClause(filter, projectId, ctx));
      return;
    }

    if (filter.name.startsWith('session.')) {
      set(buildSessionClause(filter, projectId, ctx));
      return;
    }

    // properties.* filters only make sense on the events table; ignore on
    // sessions/profiles queries. Callers that need them should query the
    // events table directly (e.g. via getEventList) or use a cohort.
  });
  return where;
}
