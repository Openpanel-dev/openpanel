/** biome-ignore-all lint/style/useDefaultSwitchClause: switch cases are exhaustive by design */
import {
  getCohortIds,
  type IChartEventFilter,
  type IChartFilterValueType,
} from '@openpanel/validation';
import sqlstring from 'sqlstring';
import { formatClickhouseDate, TABLE_NAMES } from '../clickhouse/client';
import { buildTypedClause, hasTypedCast, isTypedOperator } from './filter-cast';

export type FilterTableContext = {
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
};

/** Sentinel sessions columns that the UI may filter on directly. */
const SESSION_NUMERIC_COLUMNS = new Set([
  'screen_view_count',
  'event_count',
  'duration',
  'revenue',
]);

function escape(value: string | number | boolean | null): string {
  return sqlstring.escape(typeof value === 'string' ? value.trim() : value);
}

function trimVal(value: string | number | boolean | null): string {
  return typeof value === 'string' ? value.trim() : String(value);
}

/**
 * Build a WHERE-clause fragment for a single non-array column. Mirrors the
 * operator set used by `getEventFiltersWhereClause` so behaviour stays
 * consistent across surfaces.
 */
function compileScalarClause(
  column: string,
  operator: IChartEventFilter['operator'],
  value: IChartEventFilter['value'],
  options: { numeric?: boolean; type?: IChartFilterValueType } = {},
): string | null {
  if (
    value.length === 0 &&
    operator !== 'isNull' &&
    operator !== 'isNotNull'
  ) {
    return null;
  }

  // Explicit cast type wins over the column-name `numeric` auto-detect. Casts
  // both the column and each value consistently (see filter-cast.ts).
  if (hasTypedCast(options.type) && isTypedOperator(operator)) {
    return buildTypedClause(column, operator, value, options.type!);
  }

  const numeric = options.numeric === true;

  switch (operator) {
    case 'is': {
      if (numeric) {
        return `(${value
          .map((v) => `toFloat64(${column}) = toFloat64(${escape(v)})`)
          .join(' OR ')})`;
      }
      if (value.length === 1) {
        return `${column} = ${escape(value[0]!)}`;
      }
      return `${column} IN (${value.map(escape).join(', ')})`;
    }
    case 'isNot': {
      if (numeric) {
        return `(${value
          .map((v) => `toFloat64(${column}) != toFloat64(${escape(v)})`)
          .join(' OR ')})`;
      }
      if (value.length === 1) {
        return `${column} != ${escape(value[0]!)}`;
      }
      return `${column} NOT IN (${value.map(escape).join(', ')})`;
    }
    case 'contains': {
      return `(${value
        .map((v) => `${column} ILIKE ${sqlstring.escape(`%${trimVal(v)}%`)}`)
        .join(' OR ')})`;
    }
    case 'doesNotContain': {
      return `(${value
        .map((v) => `${column} NOT ILIKE ${sqlstring.escape(`%${trimVal(v)}%`)}`)
        .join(' AND ')})`;
    }
    case 'startsWith': {
      return `(${value
        .map((v) => `${column} ILIKE ${sqlstring.escape(`${trimVal(v)}%`)}`)
        .join(' OR ')})`;
    }
    case 'endsWith': {
      return `(${value
        .map((v) => `${column} ILIKE ${sqlstring.escape(`%${trimVal(v)}`)}`)
        .join(' OR ')})`;
    }
    case 'regex': {
      return `(${value
        .map((v) => `match(${column}, ${escape(v)})`)
        .join(' OR ')})`;
    }
    case 'isNull':
      return `(${column} = '' OR ${column} IS NULL)`;
    case 'isNotNull':
      return `(${column} != '' AND ${column} IS NOT NULL)`;
    case 'gt': {
      return `(${value
        .map(
          (v) =>
            `${numeric ? `toFloat64(${column})` : column} > ${numeric ? `toFloat64(${escape(v)})` : escape(v)}`,
        )
        .join(' OR ')})`;
    }
    case 'lt': {
      return `(${value
        .map(
          (v) =>
            `${numeric ? `toFloat64(${column})` : column} < ${numeric ? `toFloat64(${escape(v)})` : escape(v)}`,
        )
        .join(' OR ')})`;
    }
    case 'gte': {
      return `(${value
        .map(
          (v) =>
            `${numeric ? `toFloat64(${column})` : column} >= ${numeric ? `toFloat64(${escape(v)})` : escape(v)}`,
        )
        .join(' OR ')})`;
    }
    case 'lte': {
      return `(${value
        .map(
          (v) =>
            `${numeric ? `toFloat64(${column})` : column} <= ${numeric ? `toFloat64(${escape(v)})` : escape(v)}`,
        )
        .join(' OR ')})`;
    }
  }

  return null;
}

/**
 * Translate `profile.<field>` into the SQL accessor used when querying the
 * profiles table directly. Bare fields (email, first_name, …) map to columns;
 * `profile.properties.<key>` maps to the JSON `properties[key]` lookup.
 */
function profileColumnSql(name: string): string {
  const withoutPrefix = name.replace(/^profile\./, '');
  if (withoutPrefix.startsWith('properties.')) {
    const key = withoutPrefix.replace(/^properties\./, '');
    return `properties[${sqlstring.escape(key)}]`;
  }
  return withoutPrefix;
}

/**
 * Translate `group.<field>` into the SQL accessor used when querying the
 * groups table directly (no join alias).
 */
function groupColumnSql(name: string): string {
  const withoutPrefix = name.replace(/^group\./, '');
  if (withoutPrefix === 'name' || withoutPrefix === 'type' || withoutPrefix === 'id') {
    return withoutPrefix;
  }
  if (withoutPrefix.startsWith('properties.')) {
    const key = withoutPrefix.replace(/^properties\./, '');
    return `properties[${sqlstring.escape(key)}]`;
  }
  return 'id';
}

/** Translate `session.<field>` to the underlying sessions column. */
function sessionColumnSql(name: string): string | null {
  const withoutPrefix = name.replace(/^session\./, '');
  if (withoutPrefix === 'is_bounce') return 'is_bounce';
  if (SESSION_NUMERIC_COLUMNS.has(withoutPrefix)) return withoutPrefix;
  // performed_event is handled as a subselect, not a column
  return null;
}

function buildCohortClause(
  filter: IChartEventFilter,
  projectId: string,
  ctx: FilterTableContext,
): string | null {
  // `getCohortIds` normalizes the legacy single-value `cohortId` field and
  // the newer `cohortIds` array into one list. Falls back to extracting the
  // id from the `cohort:<id>` filter name when neither is set (older URL
  // formats encoded the id only in the name).
  let cohortIds = getCohortIds(filter);
  if (cohortIds.length === 0 && filter.name.startsWith('cohort:')) {
    cohortIds = [filter.name.slice('cohort:'.length)];
  }
  if (cohortIds.length === 0) return null;
  const negate = filter.operator === 'notInCohort';
  const op = negate ? 'NOT IN' : 'IN';
  const escapedIds = cohortIds.map((id) => sqlstring.escape(id)).join(', ');
  return `${ctx.profileIdExpr} ${op} (SELECT profile_id FROM ${TABLE_NAMES.cohort_members} FINAL WHERE cohort_id IN (${escapedIds}) AND project_id = ${sqlstring.escape(projectId)})`;
}

function buildGroupClause(
  filter: IChartEventFilter,
  projectId: string,
  ctx: FilterTableContext,
): string | null {
  if (!ctx.groupsExpr) return null;
  const column = groupColumnSql(filter.name);
  const inner = compileScalarClause(column, filter.operator, filter.value, {
    type: filter.type,
  });
  if (!inner) return null;
  const projectClause = `project_id = ${sqlstring.escape(projectId)}`;
  return `arrayExists(g -> g IN (SELECT id FROM ${TABLE_NAMES.groups} FINAL WHERE ${projectClause} AND ${inner}), ${ctx.groupsExpr})`;
}

function buildProfileClause(
  filter: IChartEventFilter,
  projectId: string,
  ctx: FilterTableContext,
): string | null {
  const column = profileColumnSql(filter.name);
  const numeric = column === 'created_at' || column === 'last_seen_at';
  const inner = compileScalarClause(column, filter.operator, filter.value, {
    numeric,
    type: filter.type,
  });
  if (!inner) return null;
  if (ctx.selfTable === 'profiles') {
    return inner;
  }
  return `${ctx.profileIdExpr} IN (SELECT id FROM ${TABLE_NAMES.profiles} FINAL WHERE project_id = ${sqlstring.escape(projectId)} AND ${inner})`;
}

function buildSessionClause(
  filter: IChartEventFilter,
  projectId: string,
  ctx: FilterTableContext,
): string | null {
  if (ctx.selfTable !== 'sessions') return null;
  const fieldName = filter.name.replace(/^session\./, '');

  if (fieldName === 'performed_event') {
    if (filter.value.length === 0) return null;
    const inClause =
      filter.value.length === 1
        ? `= ${escape(filter.value[0]!)}`
        : `IN (${filter.value.map(escape).join(', ')})`;
    const op = filter.operator === 'isNot' ? 'NOT IN' : 'IN';
    const dateScope: string[] = [];
    if (ctx.startDate && ctx.endDate) {
      dateScope.push(
        `toDate(created_at) BETWEEN toDate('${formatClickhouseDate(ctx.startDate)}') AND toDate('${formatClickhouseDate(ctx.endDate)}')`,
      );
    }
    const scopeSql = dateScope.length ? `AND ${dateScope.join(' AND ')} ` : '';
    return `id ${op} (SELECT DISTINCT session_id FROM ${TABLE_NAMES.events} WHERE project_id = ${sqlstring.escape(projectId)} ${scopeSql}AND name ${inClause})`;
  }

  if (fieldName === 'is_bounce') {
    if (filter.value.length === 0) return null;
    const wants = filter.value.some((v) =>
      typeof v === 'boolean' ? v : String(v).toLowerCase() === 'true',
    );
    const truthy = filter.operator === 'isNot' ? !wants : wants;
    return `is_bounce = ${truthy ? 1 : 0}`;
  }

  const column = sessionColumnSql(filter.name);
  if (!column) return null;
  return compileScalarClause(column, filter.operator, filter.value, {
    numeric: SESSION_NUMERIC_COLUMNS.has(column),
    type: filter.type,
  });
}

/**
 * Translate `IChartEventFilter[]` into a WHERE-clause record suitable for
 * merging into `createSqlBuilder().sb.where`. Handles cohort / group / profile
 * / session prefixes. Event-property (`properties.*`) filters are ignored on
 * non-events tables — they require a subquery on the events table that is
 * better expressed as a cohort.
 */
export function buildFilterWhere(
  filters: IChartEventFilter[],
  projectId: string,
  ctx: FilterTableContext,
): Record<string, string> {
  const where: Record<string, string> = {};
  filters.forEach((filter, index) => {
    const id = `f${index}`;

    if (filter.operator === 'inCohort' || filter.operator === 'notInCohort') {
      const clause = buildCohortClause(filter, projectId, ctx);
      if (clause) where[id] = clause;
      return;
    }

    if (filter.name.startsWith('cohort:')) {
      const clause = buildCohortClause(filter, projectId, ctx);
      if (clause) where[id] = clause;
      return;
    }

    if (filter.name.startsWith('group.')) {
      const clause = buildGroupClause(filter, projectId, ctx);
      if (clause) where[id] = clause;
      return;
    }

    if (filter.name.startsWith('profile.')) {
      const clause = buildProfileClause(filter, projectId, ctx);
      if (clause) where[id] = clause;
      return;
    }

    if (filter.name.startsWith('session.')) {
      const clause = buildSessionClause(filter, projectId, ctx);
      if (clause) where[id] = clause;
      return;
    }

    // properties.* filters only make sense on the events table; ignore on
    // sessions/profiles queries. Callers that need them should query the
    // events table directly (e.g. via getEventList) or use a cohort.
  });
  return where;
}
