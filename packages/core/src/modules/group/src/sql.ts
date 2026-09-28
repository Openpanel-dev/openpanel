// Every ClickHouse query the group module runs, as pure `sql` fragments.
//
// Cluster note: `groups`, `profiles` and `events` are Distributed on Cloud. No
// query here carries an `IN (subquery)`; the `IN` lists bind as `Array(String)`
// params, which is a literal list to the planner.

import { type SqlFragment, sql } from '@openpanel/db/src/clickhouse/sql';

const TABLE = {
  groups: 'groups',
  profiles: 'profiles',
  events: 'events',
} as const;

/** The one table name `group.service.ts` needs outside a query fragment. */
export const GROUPS_TABLE = TABLE.groups;

const GROUP_COLUMNS = sql`project_id, id, type, name, properties, created_at, version`;

function optional(
  condition: boolean | string | undefined | null,
  fragment: () => SqlFragment
): SqlFragment {
  return condition ? fragment() : sql.empty;
}

/** V1's `WHERE project_id = .. AND deleted = 0 [AND type = ..] [AND (name|id ILIKE ..)]`. */
function liveGroupsCondition(query: {
  projectId: string;
  type?: string;
  search?: string;
}): SqlFragment {
  return sql`project_id = ${sql.string(query.projectId)} AND deleted = 0${optional(
    query.type,
    () => sql` AND type = ${sql.string(query.type as string)}`
  )}${optional(query.search, () => {
    const pattern = sql.string(`%${query.search}%`);
    return sql` AND (name ILIKE ${pattern} OR id ILIKE ${pattern})`;
  })}`;
}

export function groupByIdQuery(query: {
  id: string;
  projectId: string;
}): SqlFragment {
  return sql`
    SELECT ${GROUP_COLUMNS}
    FROM ${sql.id(TABLE.groups)} FINAL
    WHERE project_id = ${sql.string(query.projectId)}
      AND id = ${sql.string(query.id)}
      AND deleted = 0
  `;
}

export interface GroupListQuery {
  projectId: string;
  take: number;
  offset: number;
  search?: string;
  type?: string;
}

export function groupListQuery(query: GroupListQuery): SqlFragment {
  return sql`
    SELECT ${GROUP_COLUMNS}
    FROM ${sql.id(TABLE.groups)} FINAL
    WHERE ${liveGroupsCondition(query)}
    ORDER BY created_at DESC
    LIMIT ${sql.uint64(query.take)}
    OFFSET ${sql.uint64(query.offset)}
  `;
}

export function groupListCountQuery(query: {
  projectId: string;
  type?: string;
  search?: string;
}): SqlFragment {
  return sql`
    SELECT count() as count
    FROM ${sql.id(TABLE.groups)} FINAL
    WHERE ${liveGroupsCondition(query)}
  `;
}

export function groupTypesQuery(projectId: string): SqlFragment {
  return sql`
    SELECT DISTINCT type
    FROM ${sql.id(TABLE.groups)} FINAL
    WHERE project_id = ${sql.string(projectId)}
      AND deleted = 0
  `;
}

export function groupPropertyKeysQuery(projectId: string): SqlFragment {
  return sql`
    SELECT DISTINCT arrayJoin(mapKeys(properties)) as key
    FROM ${sql.id(TABLE.groups)} FINAL
    WHERE project_id = ${sql.string(projectId)}
      AND deleted = 0
  `;
}

/**
 * Identified members only: anonymous events carry `profile_id = device_id`.
 * `hasAny` repeats the `g IN` test on the base row so it can run as a
 * PREWHERE; the alias test alone reads every event of the project.
 */
export function groupStatsQuery(query: {
  projectId: string;
  groupIds: readonly string[];
}): SqlFragment {
  const groupIds = sql.array('String', query.groupIds);
  return sql`
    SELECT
      g AS group_id,
      uniqExact(profile_id) AS member_count,
      max(created_at) AS last_active_at
    FROM ${sql.id(TABLE.events)}
    ARRAY JOIN groups AS g
    WHERE project_id = ${sql.string(query.projectId)}
      AND hasAny(groups, ${groupIds})
      AND g IN ${groupIds}
      AND profile_id != device_id
    GROUP BY g
  `;
}

export function groupsByIdsQuery(query: {
  projectId: string;
  ids: readonly string[];
}): SqlFragment {
  return sql`
    SELECT ${GROUP_COLUMNS}
    FROM ${sql.id(TABLE.groups)} FINAL
    WHERE project_id = ${sql.string(query.projectId)}
      AND id IN ${sql.array('String', query.ids)}
      AND deleted = 0
  `;
}

export interface GroupMemberProfilesQuery {
  projectId: string;
  groupId: string;
  take: number;
  offset: number;
  /** Already trimmed by the caller; empty means no search clause. */
  search?: string;
}

/** Member ids plus the window total, so one round trip pages and counts. */
export function groupMemberProfilesQuery(
  query: GroupMemberProfilesQuery
): SqlFragment {
  return sql`
    SELECT
      id,
      count() OVER () AS total_count
    FROM ${sql.id(TABLE.profiles)} FINAL
    WHERE project_id = ${sql.string(query.projectId)}
      AND has(groups, ${sql.string(query.groupId)})
      ${optional(query.search, () => {
        const pattern = sql.string(`%${query.search}%`);
        return sql`AND (email ILIKE ${pattern} OR first_name ILIKE ${pattern} OR last_name ILIKE ${pattern})`;
      })}
    ORDER BY created_at DESC
    LIMIT ${sql.uint64(query.take)}
    OFFSET ${sql.uint64(query.offset)}
  `;
}

// ---- packages/trpc/src/routers/group.ts's inline queries

export function groupEventMetricsQuery(query: {
  projectId: string;
  groupId: string;
}): SqlFragment {
  return sql`
    SELECT
      count() AS totalEvents,
      min(created_at) AS firstSeen,
      max(created_at) AS lastSeen
    FROM ${sql.id(TABLE.events)}
    WHERE project_id = ${sql.string(query.projectId)}
      AND has(groups, ${sql.string(query.groupId)})
  `;
}

export function groupUniqueProfilesQuery(query: {
  projectId: string;
  groupId: string;
}): SqlFragment {
  return sql`
    SELECT count() AS uniqueProfiles
    FROM ${sql.id(TABLE.profiles)} FINAL
    WHERE project_id = ${sql.string(query.projectId)}
      AND has(groups, ${sql.string(query.groupId)})
  `;
}

export function groupActivityQuery(query: {
  projectId: string;
  groupId: string;
}): SqlFragment {
  return sql`
    SELECT count() AS count, toStartOfDay(created_at) AS date
    FROM ${sql.id(TABLE.events)}
    WHERE project_id = ${sql.string(query.projectId)}
      AND has(groups, ${sql.string(query.groupId)})
    GROUP BY date
    ORDER BY date DESC
  `;
}

const MEMBER_GROWTH_WINDOW_DAYS = 30;
const MEMBER_GROWTH_FILL_FROM_DAYS_AGO = MEMBER_GROWTH_WINDOW_DAYS - 1;

export function groupMemberGrowthQuery(query: {
  projectId: string;
  groupId: string;
}): SqlFragment {
  return sql`
    SELECT
      toDate(toStartOfDay(created_at)) AS date,
      count() AS count
    FROM ${sql.id(TABLE.profiles)} FINAL
    WHERE project_id = ${sql.string(query.projectId)}
      AND has(groups, ${sql.string(query.groupId)})
      AND created_at >= now() - INTERVAL ${sql.uint64(MEMBER_GROWTH_WINDOW_DAYS)} DAY
    GROUP BY date
    ORDER BY date ASC WITH FILL
      FROM toDate(now() - INTERVAL ${sql.uint64(MEMBER_GROWTH_FILL_FROM_DAYS_AGO)} DAY)
      TO toDate(now() + INTERVAL 1 DAY)
      STEP 1
  `;
}

const TOP_LIST_LIMIT = 10;

export function groupMostEventsQuery(query: {
  projectId: string;
  groupId: string;
}): SqlFragment {
  return sql`
    SELECT count() as count, name
    FROM ${sql.id(TABLE.events)}
    WHERE project_id = ${sql.string(query.projectId)}
      AND has(groups, ${sql.string(query.groupId)})
      AND name NOT IN ('screen_view', 'session_start', 'session_end')
    GROUP BY name
    ORDER BY count DESC
    LIMIT ${sql.uint64(TOP_LIST_LIMIT)}
  `;
}

export function groupPopularRoutesQuery(query: {
  projectId: string;
  groupId: string;
}): SqlFragment {
  return sql`
    SELECT count() as count, path
    FROM ${sql.id(TABLE.events)}
    WHERE project_id = ${sql.string(query.projectId)}
      AND has(groups, ${sql.string(query.groupId)})
      AND name = 'screen_view'
    GROUP BY path
    ORDER BY count DESC
    LIMIT ${sql.uint64(TOP_LIST_LIMIT)}
  `;
}
