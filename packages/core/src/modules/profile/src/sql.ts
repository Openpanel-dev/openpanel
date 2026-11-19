// `profiles`, `events` and `sessions` are Distributed on Cloud. The `IN (SELECT...)`
// subqueries run under the client's `distributed_product_mode: 'allow'`. Every `IN`
// list binds as `Array(String)`, a literal list to the planner.

import { type SqlFragment, sql } from '@openpanel/db/src/clickhouse/sql';
import { toRangeBoundaryLiteral } from '../../../shared/ch-dates';
import { AI_INTERNAL_EVENT_NAMES } from '../../ai/ai.constants';
import {
  type CompiledFilterClauses,
  compiledFilterFragments,
} from './filter-clauses';

const TABLE = {
  profiles: 'profiles',
  events: 'events',
  sessions: 'sessions',
} as const;

const NOT_AI_INTERNAL = sql`name NOT IN ${sql.array('String', AI_INTERNAL_EVENT_NAMES)}`;

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

const PROFILE_KEY_COLUMNS = ['id', 'project_id'] as const;

type ProfileColumn = (typeof PROFILE_COLUMNS)[number];

/** A column on the raw rows, or its newest version per id (for a `GROUP BY id`). */
export type ProfileColumnAccess = (column: ProfileColumn) => SqlFragment;

export const profileColumn: ProfileColumnAccess = (column) =>
  sql.id(column, PROFILE_COLUMNS);

export const latestProfileColumn: ProfileColumnAccess = (column) =>
  column === 'id'
    ? sql.id(column, PROFILE_COLUMNS)
    : sql`argMax(${sql.id(column, PROFILE_COLUMNS)}, last_seen_at)`;

/**
 * The newest version of every column, as `profiles FINAL` would return it,
 * for a `GROUP BY id, project_id` over the raw rows. `last_seen_at` is the
 * ReplacingMergeTree version column; the `p.` prefix keeps it from resolving
 * to the aggregate alias of the same name.
 */
const PROFILE_LATEST_COLUMNS_FRAGMENT = sql.join(
  PROFILE_COLUMNS.map((column) => {
    if ((PROFILE_KEY_COLUMNS as readonly string[]).includes(column)) {
      return sql.id(column, PROFILE_COLUMNS);
    }
    if (column === 'last_seen_at') {
      return sql`max(p.last_seen_at) AS last_seen_at`;
    }
    return sql`argMax(${sql.id(column, PROFILE_COLUMNS)}, p.last_seen_at) AS ${sql.id(column, PROFILE_COLUMNS)}`;
  }),
  ', '
);

const SEARCH_MAX_TOKENS = 5;
/** Below this the list ignores the search: one letter matches nearly every profile. */
export const PROFILE_LIST_SEARCH_MIN_LENGTH = 2;
const SEARCH_TOKEN_SEPARATOR = /\s+/;

function optional(
  condition: unknown,
  fragment: () => SqlFragment
): SqlFragment {
  return condition ? fragment() : sql.empty;
}

function dateRangeWhere(
  column: string,
  startDate: string,
  endDate: string
): SqlFragment {
  return sql`${sql.id(column)} BETWEEN toDateTime(${sql.string(toRangeBoundaryLiteral(startDate, 'start'))}) AND toDateTime(${sql.string(toRangeBoundaryLiteral(endDate, 'end'))})`;
}

/** The window every profile-list / power-user statement is bounded to. */
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
  search: string | null | undefined,
  column: ProfileColumnAccess = profileColumn
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
    return sql`(${column('id')} ILIKE ${like} OR ${column('email')} ILIKE ${like} OR ${column('first_name')} ILIKE ${like} OR ${column('last_name')} ILIKE ${like} OR concat(${column('first_name')}, ' ', ${column('last_name')}) ILIKE ${like})`;
  });
  return sql`(${sql.join(perToken, ' AND ')})`;
}

/**
 * Session figures come from `sessions`, not from `session_start` events: the
 * events sent before `identify()` carry the device id as `profile_id`, while
 * the session row is rewritten to the final profile id. Durations are seconds.
 */
export function profileMetricsQuery(query: {
  profileId: string;
  projectId: string;
}): SqlFragment {
  const profileId = sql.string(query.profileId);
  const projectId = sql.string(query.projectId);
  // FINAL turns off automatic PREWHERE on `sessions`. Both PREWHERE columns
  // are in the sort key, so a -1 and its +1 pass together; `sign` stays in
  // WHERE so the collapse happens first.
  return sql`
    WITH profileSeen AS (
      SELECT created_at as firstSeen, last_seen_at as lastSeen
      FROM ${sql.id(TABLE.profiles)}
      WHERE id = ${profileId} AND project_id = ${projectId}
      ORDER BY last_seen_at DESC
      LIMIT 1
    ),
    eventStats AS (
      SELECT
        countIf(name = 'screen_view') as screenViews,
        count(*) as totalEvents,
        count(DISTINCT toDate(created_at)) as uniqueDaysActive,
        countIf(name NOT IN ('screen_view', 'session_start', 'session_end')) as conversionEvents,
        sumIf(revenue, name = 'revenue') as revenue
      FROM ${sql.id(TABLE.events)}
      WHERE profile_id = ${profileId} AND project_id = ${projectId} AND ${NOT_AI_INTERNAL}
    ),
    sessionStats AS (
      SELECT
        count() as sessions,
        round(ifNotFinite(avgIf(duration, duration != 0), 0) / 1000, 2) as durationAvg,
        round(ifNotFinite(quantilesExactInclusiveIf(0.9)(duration, duration != 0)[1], 0) / 1000, 2) as durationP90,
        round(ifNotFinite(avg(is_bounce), 0) * 100, 4) as bounceRate
      FROM ${sql.id(TABLE.sessions)} FINAL
      PREWHERE project_id = ${projectId} AND profile_id = ${profileId}
      WHERE sign = 1
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
    FROM eventStats CROSS JOIN sessionStats
  `;
}

export function profileByIdQuery(query: {
  id: string;
  projectId: string;
}): SqlFragment {
  return sql`
    SELECT ${PROFILE_COLUMNS_FRAGMENT}
    FROM ${sql.id(TABLE.profiles)}
    WHERE id = ${sql.string(query.id)} AND project_id = ${sql.string(query.projectId)}
    ORDER BY last_seen_at DESC
    LIMIT 1
  `;
}

export function profilesByIdsQuery(query: {
  projectId: string;
  ids: readonly string[];
}): SqlFragment {
  return sql`
    SELECT ${PROFILE_LATEST_COLUMNS_FRAGMENT}
    FROM ${sql.id(TABLE.profiles)} AS p
    WHERE
      p.project_id = ${sql.string(query.projectId)} AND
      p.id IN ${sql.array('String', query.ids)}
    GROUP BY p.id, p.project_id
  `;
}

export interface ProfileListQuery extends ProfileWindow {
  projectId: string;
  search?: string;
  isExternal?: boolean;
  /** Pre-compiled by `buildFilterWhere` on the raw rows (src/filter-clauses.ts). */
  filterClauses: CompiledFilterClauses;
  /** The same filters compiled on the newest version (`latestVersion: true`). */
  latestFilterClauses: CompiledFilterClauses;
}

/**
 * Ids whose newest version satisfies `having`, ranked by first seen.
 *
 * `scope` (project, first-seen window) and `where` (id-level subqueries) are
 * the same for every version of a profile, so they may filter rows.
 * `candidates` holds the column conditions on the raw rows: they only narrow
 * the id set, through a subquery, and never the rows the aggregate reads —
 * otherwise argMax would see nothing but the matching stale version and the
 * HAVING clause would pass on it. The set is a superset of the answer, since
 * the surviving version is one of the rows, and holds hashes: a String set
 * costs ~300 bytes per id, and a collision only adds a candidate.
 */
interface LatestProfileIdsPage {
  scope: SqlFragment;
  where?: SqlFragment[];
  candidates: SqlFragment[];
  having: SqlFragment[];
}

function latestProfileIdsWhere(page: LatestProfileIdsPage): SqlFragment {
  const conditions = [page.scope, ...(page.where ?? [])];
  if (page.candidates.length) {
    conditions.push(
      sql`cityHash64(id) IN (SELECT cityHash64(id) FROM ${sql.id(TABLE.profiles)} WHERE ${page.scope} AND ${sql.join(page.candidates, ' AND ')})`
    );
  }
  const having = page.having.length
    ? sql` HAVING ${sql.join(page.having, ' AND ')}`
    : sql.empty;
  return sql`WHERE ${sql.join(conditions, ' AND ')} GROUP BY id${having}`;
}

function latestProfileIdsQuery(
  page: LatestProfileIdsPage & {
    orderDirection: SqlFragment;
    limit: number;
    offset?: number;
  }
): SqlFragment {
  return sql`SELECT id FROM ${sql.id(TABLE.profiles)} ${latestProfileIdsWhere(page)} ORDER BY ${latestProfileColumn('created_at')} ${page.orderDirection} LIMIT ${sql.uint64(page.limit)}${optional(
    page.offset,
    () => sql` OFFSET ${sql.uint64(page.offset as number)}`
  )}`;
}

/** The page's rows, newest version of every column, in the ids' order. */
function latestProfilesPage(
  projectId: string,
  ids: SqlFragment,
  orderDirection: SqlFragment
): SqlFragment {
  return sql`
    SELECT ${PROFILE_LATEST_COLUMNS_FRAGMENT}
    FROM ${sql.id(TABLE.profiles)} AS p
    WHERE p.project_id = ${sql.string(projectId)} AND p.id IN (${ids})
    GROUP BY p.id, p.project_id
    ORDER BY created_at ${orderDirection}
  `;
}

function profileListSearch(query: ProfileListQuery): string | undefined {
  const search = query.search?.trim();
  return search && search.length >= PROFILE_LIST_SEARCH_MIN_LENGTH
    ? search
    : undefined;
}

/**
 * `project_id =.. [AND created_at BETWEEN ..]`: bounded to a window rather
 * than reading every profile the project ever had — otherwise the cost grows
 * with the tenant's lifetime rather than with anything the caller asked for.
 * `created_at` is the column the list already orders by, so the bound and
 * the order agree; the write path keeps it the same across versions.
 * A search is the exception: looking someone up by name has to find them
 * however long ago they signed up, and the search itself bounds the rows.
 */
function profileListScope(query: ProfileListQuery): SqlFragment {
  const projectScope = sql`project_id = ${sql.string(query.projectId)}`;
  if (profileListSearch(query)) {
    return projectScope;
  }
  return sql`${projectScope} AND ${dateRangeWhere(
    'created_at',
    query.startDate,
    query.endDate
  )}`;
}

/**
 * `[search] [is_external =..] [filters]` as conditions on one version:
 * the raw rows (candidates) or the newest one per id (the answer).
 */
function profileListConditions(
  query: ProfileListQuery,
  column: ProfileColumnAccess,
  filterClauses: CompiledFilterClauses
): SqlFragment[] {
  const conditions: SqlFragment[] = [];
  const search = profileSearchCondition(profileListSearch(query), column);
  if (search) {
    conditions.push(search);
  }
  if (query.isExternal !== undefined) {
    conditions.push(
      sql`${column('is_external')} = ${sql.bool(query.isExternal)}`
    );
  }
  conditions.push(...compiledFilterFragments(filterClauses));
  return conditions;
}

function profileListPage(query: ProfileListQuery): LatestProfileIdsPage {
  return {
    scope: profileListScope(query),
    candidates: profileListConditions(
      query,
      profileColumn,
      query.filterClauses
    ),
    having: profileListConditions(
      query,
      latestProfileColumn,
      query.latestFilterClauses
    ),
  };
}

export function profileListQuery(
  query: ProfileListQuery & { take: number; offset: number }
): SqlFragment {
  const orderDirection = sql`DESC`;
  return latestProfilesPage(
    query.projectId,
    latestProfileIdsQuery({
      ...profileListPage(query),
      orderDirection,
      limit: query.take,
      offset: query.offset,
    }),
    orderDirection
  );
}

/** One per profile whose newest version matches: exactly what the page shows. */
export function profileListCountQuery(query: ProfileListQuery): SqlFragment {
  return sql`
    SELECT count() as count
    FROM (SELECT id FROM ${sql.id(TABLE.profiles)} ${latestProfileIdsWhere(profileListPage(query))})
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
  latestFilterClauses: CompiledFilterClauses;
  sortOrder: 'asc' | 'desc';
  limit: number;
}

const PROFILE_PROPERTY_FILTERS = [
  'country',
  'city',
  'device',
  'browser',
] as const;

/**
 * `where` holds the id-level conditions, the same for every version;
 * `candidates` every column condition on the raw rows and `having` the same
 * on the newest version (see latestProfileIdsQuery).
 */
function findProfilesConditions(query: FindProfilesQuery): {
  where: SqlFragment[];
  candidates: SqlFragment[];
  having: SqlFragment[];
} {
  const projectId = sql.string(query.projectId);
  const where: SqlFragment[] = [];
  const candidates: SqlFragment[] = [];
  const having: SqlFragment[] = [];
  const onBothVersions = (
    condition: (column: ProfileColumnAccess) => SqlFragment | null
  ) => {
    const anyVersion = condition(profileColumn);
    const latestVersion = condition(latestProfileColumn);
    if (anyVersion && latestVersion) {
      candidates.push(anyVersion);
      having.push(latestVersion);
    }
  };

  if (query.email) {
    onBothVersions(
      (column) =>
        sql`${column('email')} ILIKE ${sql.string(`%${query.email}%`)}`
    );
  }
  if (query.name) {
    onBothVersions((column) => profileSearchCondition(query.name, column));
  }
  for (const key of PROFILE_PROPERTY_FILTERS) {
    const value = query[key];
    if (value) {
      onBothVersions(
        (column) =>
          sql`${column('properties')}[${sql.string(key)}] = ${sql.string(value)}`
      );
    }
  }

  if (query.inactiveDays !== undefined) {
    where.push(sql`id NOT IN (
      SELECT DISTINCT profile_id FROM ${sql.id(TABLE.events)}
      WHERE project_id = ${projectId}
        AND profile_id != ''
        AND created_at >= now() - INTERVAL ${sql.uint64(query.inactiveDays)} DAY
    )`);
  }

  if (query.minSessions !== undefined) {
    where.push(sql`id IN (
      SELECT profile_id FROM ${sql.id(TABLE.sessions)}
      WHERE project_id = ${projectId}
        AND sign = 1
        AND profile_id != ''
      GROUP BY profile_id
      HAVING count() >= ${sql.uint64(query.minSessions)}
    )`);
  }

  if (query.performedEvent) {
    where.push(sql`id IN (
      SELECT DISTINCT profile_id FROM ${sql.id(TABLE.events)}
      WHERE project_id = ${projectId}
        AND name = ${sql.string(query.performedEvent)}
    )`);
  }

  candidates.push(...compiledFilterFragments(query.filterClauses));
  having.push(...compiledFilterFragments(query.latestFilterClauses));

  return { where, candidates, having };
}

export function findProfilesQuery(query: FindProfilesQuery): SqlFragment {
  const orderDirection = query.sortOrder === 'asc' ? sql`ASC` : sql`DESC`;
  const { where, candidates, having } = findProfilesConditions(query);
  return latestProfilesPage(
    query.projectId,
    latestProfileIdsQuery({
      scope: sql`project_id = ${sql.string(query.projectId)}`,
      where,
      candidates,
      having,
      orderDirection,
      limit: query.limit,
    }),
    orderDirection
  );
}

export function profileRowQuery(query: {
  projectId: string;
  profileId: string;
}): SqlFragment {
  return sql`
      SELECT ${PROFILE_COLUMNS_FRAGMENT}
      FROM ${sql.id(TABLE.profiles)}
      WHERE project_id = ${sql.string(query.projectId)} AND id = ${sql.string(query.profileId)}
      ORDER BY last_seen_at DESC
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

export function profileActivityQuery(query: {
  projectId: string;
  profileId: string;
}): SqlFragment {
  return sql`SELECT count(*) as count, toStartOfDay(created_at) as date FROM ${sql.id(TABLE.events)} WHERE project_id = ${sql.string(query.projectId)} and profile_id = ${sql.string(query.profileId)} AND ${NOT_AI_INTERNAL} GROUP BY date ORDER BY date DESC`;
}

export function profileMostEventsQuery(query: {
  projectId: string;
  profileId: string;
}): SqlFragment {
  return sql`SELECT count(*) as count, name FROM ${sql.id(TABLE.events)} WHERE name NOT IN ('screen_view', 'session_start', 'session_end') AND project_id = ${sql.string(query.projectId)} and profile_id = ${sql.string(query.profileId)} AND ${NOT_AI_INTERNAL} GROUP BY name ORDER BY count DESC`;
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

/** Bounded to the caller's window: unbounded, it ranked every event the project ever recorded. */
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
 * A bare column has to be one of `PROFILE_VALUE_COLUMNS` (`sql.id` throws
 * otherwise).
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
