// Every ClickHouse query the profile module runs, as pure `sql` fragments
// (ADR-013). Converted 1:1 from packages/db/src/services/profile.service.ts
// and packages/trpc/src/routers/profile.ts (M7-002): the SQL text is V1's,
// with every value bound as a `{pN:Type}` parameter instead of an escaped
// literal. Each builder's result set was diffed against V1's on the local
// prod-copy; the statements, params, row counts and timings are in
// profile.sql.proof.md.
//
// Cluster note (docs/ENVIRONMENT.md): `profiles`, `events` and `sessions` are
// Distributed on Cloud. `findProfilesQuery`'s three `IN (SELECT ...)`
// subqueries and any a filter compiles to keep V1's exact shape and run under
// the client's `distributed_product_mode: 'allow'` as before — converting a
// query is not the place to change its cluster semantics. Every `IN` list
// binds as `Array(String)`, a literal list to the planner.

import { type SqlFragment, sql } from '@openpanel/db/src/clickhouse/sql';
import { toRangeBoundaryLiteral } from '../../../shared/ch-dates';
import {
  type CompiledFilterClauses,
  compiledFilterFragments,
  spliceCompiledFilters,
} from './filter-clauses';

const TABLE = {
  profiles: 'profiles',
  events: 'events',
  sessions: 'sessions',
} as const;

export const PROFILE_COLUMNS = [
  'id',
  'first_name',
  'last_name',
  'email',
  'avatar',
  'properties',
  'project_id',
  'is_external',
  'created_at',
  'last_seen_at',
  'groups',
] as const;

const PROFILE_COLUMNS_FRAGMENT = sql.join(
  PROFILE_COLUMNS.map((column) => sql.id(column, PROFILE_COLUMNS)),
  ', '
);

const SEARCH_MAX_TOKENS = 5;
const SEARCH_TOKEN_SEPARATOR = /\s+/;

function optional(
  condition: unknown,
  fragment: () => SqlFragment
): SqlFragment {
  return condition ? fragment() : sql.empty;
}

/** Same spelling `overview/src/pages.sql.ts` uses, so the two read alike. */
function dateRangeWhere(
  column: string,
  startDate: string,
  endDate: string
): SqlFragment {
  return sql`${sql.id(column)} BETWEEN toDateTime(${sql.string(toRangeBoundaryLiteral(startDate, 'start'))}) AND toDateTime(${sql.string(toRangeBoundaryLiteral(endDate, 'end'))})`;
}

/** The window every profile-list / power-user statement is now bounded to. */
export interface ProfileWindow {
  startDate: string;
  endDate: string;
}

/**
 * Multi-token profile search: every whitespace-separated token (max 5) must
 * match SOME of id/email/first/last/full name, case-insensitively. `null`
 * when the search is blank.
 */
export function profileSearchCondition(
  search: string | null | undefined
): SqlFragment | null {
  const tokens = (search ?? '')
    .trim()
    .split(SEARCH_TOKEN_SEPARATOR)
    .filter(Boolean)
    .slice(0, SEARCH_MAX_TOKENS);
  if (tokens.length === 0) {
    return null;
  }
  const perToken = tokens.map((token) => {
    const like = sql.string(`%${token}%`);
    return sql`(id ILIKE ${like} OR email ILIKE ${like} OR first_name ILIKE ${like} OR last_name ILIKE ${like} OR concat(first_name, ' ', last_name) ILIKE ${like})`;
  });
  return sql`(${sql.join(perToken, ' AND ')})`;
}

export function profileMetricsQuery(query: {
  profileId: string;
  projectId: string;
}): SqlFragment {
  const profileId = sql.string(query.profileId);
  const projectId = sql.string(query.projectId);
  return sql`
    WITH profileSeen AS (
      SELECT created_at as firstSeen, last_seen_at as lastSeen
      FROM ${sql.id(TABLE.profiles)} FINAL
      WHERE id = ${profileId} AND project_id = ${projectId}
      LIMIT 1
    ),
    eventStats AS (
      SELECT
        countIf(name = 'screen_view') as screenViews,
        countIf(name = 'session_start') as sessions,
        round(avgIf(duration, name = 'session_end' AND duration != 0) / 1000 / 60, 2) as durationAvg,
        round(quantilesExactInclusiveIf(0.9)(duration, name = 'session_end' AND duration != 0)[1] / 1000 / 60, 2) as durationP90,
        count(*) as totalEvents,
        count(DISTINCT toDate(created_at)) as uniqueDaysActive,
        round(avgIf(properties['__bounce'] = '1', name = 'session_end') * 100, 4) as bounceRate,
        countIf(name NOT IN ('screen_view', 'session_start', 'session_end')) as conversionEvents,
        sumIf(revenue, name = 'revenue') as revenue
      FROM ${sql.id(TABLE.events)}
      WHERE profile_id = ${profileId} AND project_id = ${projectId}
    )
    SELECT
      (SELECT lastSeen FROM profileSeen) as lastSeen,
      (SELECT firstSeen FROM profileSeen) as firstSeen,
      screenViews,
      sessions,
      durationAvg,
      durationP90,
      totalEvents,
      uniqueDaysActive,
      bounceRate,
      round(totalEvents / nullIf(sessions, 0), 2) as avgEventsPerSession,
      conversionEvents,
      CASE
        WHEN sessions <= 1 THEN 0
        ELSE round(dateDiff('second', (SELECT firstSeen FROM profileSeen), (SELECT lastSeen FROM profileSeen)) / nullIf(sessions - 1, 0), 1)
      END as avgTimeBetweenSessions,
      revenue
    FROM eventStats
  `;
}

export function profileByIdQuery(query: {
  id: string;
  projectId: string;
}): SqlFragment {
  return sql`
    SELECT ${PROFILE_COLUMNS_FRAGMENT}
    FROM ${sql.id(TABLE.profiles)} FINAL
    WHERE id = ${sql.string(query.id)} AND project_id = ${sql.string(query.projectId)}
    LIMIT 1
  `;
}

export function profilesByIdsQuery(query: {
  projectId: string;
  ids: readonly string[];
}): SqlFragment {
  // FINAL turns off automatic PREWHERE, so without it every column (mostly
  // `properties`) is read for the whole project range. Safe before the FINAL
  // merge: both conditions are sort-key columns, shared by every row version.
  return sql`
    SELECT ${PROFILE_COLUMNS_FRAGMENT}
    FROM ${sql.id(TABLE.profiles)} FINAL
    PREWHERE
      project_id = ${sql.string(query.projectId)} AND
      id IN ${sql.array('String', query.ids)}
  `;
}

export interface ProfileListQuery extends ProfileWindow {
  projectId: string;
  search?: string;
  isExternal?: boolean;
  /** Pre-compiled by `buildFilterWhere` (src/filter-clauses.ts). */
  filterClauses: CompiledFilterClauses;
}

/**
 * V1's `WHERE project_id = .. [AND search] [AND is_external = ..] [AND filters]`,
 * plus the M31-003 window: V1 read every profile the project ever had, so the
 * cost grew with the tenant's lifetime rather than with anything the caller
 * asked for. `created_at` is the column the list already orders by, so the
 * bound and the order agree.
 */
function profileListCondition(query: ProfileListQuery): SqlFragment {
  const search = profileSearchCondition(query.search);
  return sql`project_id = ${sql.string(query.projectId)} AND ${dateRangeWhere(
    'created_at',
    query.startDate,
    query.endDate
  )}${optional(search, () => sql` AND ${search as SqlFragment}`)}${optional(
    query.isExternal !== undefined,
    () => sql` AND is_external = ${sql.bool(query.isExternal as boolean)}`
  )} ${spliceCompiledFilters(query.filterClauses)}`;
}

export function profileListQuery(
  query: ProfileListQuery & { take: number; offset: number }
): SqlFragment {
  return sql`
    SELECT *
    FROM ${sql.id(TABLE.profiles)} FINAL
    WHERE ${profileListCondition(query)}
    ORDER BY created_at DESC
    LIMIT ${sql.uint64(query.take)}
    ${optional(query.offset, () => sql`OFFSET ${sql.uint64(query.offset)}`)}
  `;
}

// `uniqExact`, not `count`: the page reads `profiles FINAL` so it sees one row
// per id, while the count deliberately skips FINAL (it is the expensive half
// on a large tenant). Counting rows therefore counted every unmerged
// ReplacingMergeTree version and the total ran ahead of the list
// (main 1f21214a).
export function profileListCountQuery(query: ProfileListQuery): SqlFragment {
  return sql`
    SELECT uniqExact(id) as count
    FROM ${sql.id(TABLE.profiles)}
    WHERE ${profileListCondition(query)}
    GROUP BY project_id
  `;
}

export interface FindProfilesQuery {
  projectId: string;
  name?: string;
  email?: string;
  country?: string;
  city?: string;
  device?: string;
  browser?: string;
  /** Already floored to an integer by the service. */
  inactiveDays?: number;
  /** Already floored to an integer by the service. */
  minSessions?: number;
  performedEvent?: string;
  filterClauses: CompiledFilterClauses;
  sortOrder: 'asc' | 'desc';
  limit: number;
}

const PROFILE_PROPERTY_FILTERS = [
  'country',
  'city',
  'device',
  'browser',
] as const;

function findProfilesConditions(query: FindProfilesQuery): SqlFragment[] {
  const projectId = sql.string(query.projectId);
  const conditions: SqlFragment[] = [sql`project_id = ${projectId}`];

  if (query.email) {
    conditions.push(sql`email ILIKE ${sql.string(`%${query.email}%`)}`);
  }
  const nameCondition = profileSearchCondition(query.name);
  if (query.name && nameCondition) {
    conditions.push(nameCondition);
  }
  for (const key of PROFILE_PROPERTY_FILTERS) {
    const value = query[key];
    if (value) {
      conditions.push(
        sql`properties[${sql.string(key)}] = ${sql.string(value)}`
      );
    }
  }

  if (query.inactiveDays !== undefined) {
    conditions.push(sql`id NOT IN (
      SELECT DISTINCT profile_id FROM ${sql.id(TABLE.events)}
      WHERE project_id = ${projectId}
        AND profile_id != ''
        AND created_at >= now() - INTERVAL ${sql.uint64(query.inactiveDays)} DAY
    )`);
  }

  if (query.minSessions !== undefined) {
    conditions.push(sql`id IN (
      SELECT profile_id FROM ${sql.id(TABLE.sessions)}
      WHERE project_id = ${projectId}
        AND sign = 1
        AND profile_id != ''
      GROUP BY profile_id
      HAVING count() >= ${sql.uint64(query.minSessions)}
    )`);
  }

  if (query.performedEvent) {
    conditions.push(sql`id IN (
      SELECT DISTINCT profile_id FROM ${sql.id(TABLE.events)}
      WHERE project_id = ${projectId}
        AND name = ${sql.string(query.performedEvent)}
    )`);
  }

  conditions.push(...compiledFilterFragments(query.filterClauses));

  return conditions;
}

export function findProfilesQuery(query: FindProfilesQuery): SqlFragment {
  const orderDirection = query.sortOrder === 'asc' ? sql`ASC` : sql`DESC`;
  return sql`
    SELECT ${PROFILE_COLUMNS_FRAGMENT}
    FROM ${sql.id(TABLE.profiles)} FINAL
    WHERE ${sql.join(findProfilesConditions(query), ' AND ')}
    ORDER BY created_at ${orderDirection}
    LIMIT ${sql.uint64(query.limit)}
  `;
}

export function profileRowQuery(query: {
  projectId: string;
  profileId: string;
}): SqlFragment {
  return sql`
      SELECT ${PROFILE_COLUMNS_FRAGMENT}
      FROM ${sql.id(TABLE.profiles)} FINAL
      WHERE project_id = ${sql.string(query.projectId)} AND id = ${sql.string(query.profileId)}
      LIMIT 1
    `;
}

/** `toDate(created_at)` leads the ORDER BY so it matches the events sort key; see eventListQuery. */
export function profileRecentEventsQuery(query: {
  projectId: string;
  profileId: string;
  limit: number;
}): SqlFragment {
  return sql`SELECT * FROM ${sql.id(TABLE.events)} WHERE project_id = ${sql.string(query.projectId)} AND profile_id = ${sql.string(query.profileId)} ORDER BY toDate(created_at) DESC, created_at DESC LIMIT ${sql.uint64(query.limit)}`;
}

export function profileSessionsQuery(query: {
  projectId: string;
  profileId: string;
  limit: number;
}): SqlFragment {
  return sql`SELECT * FROM ${sql.id(TABLE.sessions)} WHERE project_id = ${sql.string(query.projectId)} AND profile_id = ${sql.string(query.profileId)} AND sign = 1 ORDER BY created_at DESC LIMIT ${sql.uint64(query.limit)}`;
}

/** No `FINAL`: older row versions only contribute keys that existed at some point. */
export function profilePropertyKeysQuery(projectId: string): SqlFragment {
  return sql`SELECT DISTINCT arrayJoin(mapKeys(properties)) as key FROM ${sql.id(TABLE.profiles)} WHERE project_id = ${sql.string(projectId)} AND is_external = ${sql.bool(true)}`;
}

// ---- packages/trpc/src/routers/profile.ts's inline queries

export function profileActivityQuery(query: {
  projectId: string;
  profileId: string;
}): SqlFragment {
  return sql`SELECT count(*) as count, toStartOfDay(created_at) as date FROM ${sql.id(TABLE.events)} WHERE project_id = ${sql.string(query.projectId)} and profile_id = ${sql.string(query.profileId)} GROUP BY date ORDER BY date DESC`;
}

export function profileMostEventsQuery(query: {
  projectId: string;
  profileId: string;
}): SqlFragment {
  return sql`SELECT count(*) as count, name FROM ${sql.id(TABLE.events)} WHERE name NOT IN ('screen_view', 'session_start', 'session_end') AND project_id = ${sql.string(query.projectId)} and profile_id = ${sql.string(query.profileId)} GROUP BY name ORDER BY count DESC`;
}

const POPULAR_ROUTES_LIMIT = 10;

export function profilePopularRoutesQuery(query: {
  projectId: string;
  profileId: string;
}): SqlFragment {
  return sql`SELECT count(*) as count, path FROM ${sql.id(TABLE.events)} WHERE name = 'screen_view' AND project_id = ${sql.string(query.projectId)} and profile_id = ${sql.string(query.profileId)} GROUP BY path ORDER BY count DESC LIMIT ${sql.uint64(POPULAR_ROUTES_LIMIT)}`;
}

export function profilePropertyNamesQuery(projectId: string): SqlFragment {
  return sql`SELECT distinct mapKeys(properties) as keys from ${sql.id(TABLE.profiles)} where project_id = ${sql.string(projectId)};`;
}

/**
 * M31-003: bounded to the caller's window. Unbounded this ranked every event
 * the project ever recorded (44.2 M rows on the busiest anchor), so "power
 * users of all time" is now "power users of the range".
 */
export function powerUsersQuery(
  query: ProfileWindow & {
    projectId: string;
    take: number;
    offset: number;
  }
): SqlFragment {
  return sql`
        SELECT profile_id, count(*) as count
        FROM ${sql.id(TABLE.events)}
        WHERE
          profile_id != ''
          AND project_id = ${sql.string(query.projectId)}
          AND ${dateRangeWhere('created_at', query.startDate, query.endDate)}
          GROUP BY profile_id
          ORDER BY count() DESC
          LIMIT ${sql.uint64(query.take)} ${optional(query.offset, () => sql`OFFSET ${sql.uint64(query.offset)}`)}`;
}

/** The only bare columns `profile.properties` offers the picker. */
export const PROFILE_VALUE_COLUMNS = [
  'id',
  'first_name',
  'last_name',
  'email',
] as const;

const PROPERTIES_PREFIX = /^properties\./;

/**
 * V1 interpolated `property` raw into the SELECT; a bare column now has to be
 * one of `PROFILE_VALUE_COLUMNS` (`sql.id` throws otherwise).
 */
export function profileValuesQuery(query: {
  projectId: string;
  property: string;
}): SqlFragment {
  const values = PROPERTIES_PREFIX.test(query.property)
    ? sql`distinct arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(properties, ${sql.string(
        query.property.replace(PROPERTIES_PREFIX, '').replace('.*.', '.%.')
      )}))) as values`
    : sql`${sql.id(query.property, PROFILE_VALUE_COLUMNS)} as values`;
  return sql`SELECT ${values} FROM ${sql.id(TABLE.profiles)} WHERE project_id = ${sql.string(query.projectId)}`;
}
