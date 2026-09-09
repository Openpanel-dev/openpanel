// Every ClickHouse query the event module runs, as pure `sql` fragments
// (ADR-013). Converted 1:1 from packages/db/src/services/event.service.ts and
// packages/trpc/src/routers/event.ts (M7-002): the SQL text is V1's, with
// every value bound as a `{pN:Type}` parameter instead of an escaped literal.
// Each builder's result set was diffed against V1's on the local prod-copy;
// the statements, params, row counts and timings are in sql.proof.md.
//
// Dates bind as V1's own `YYYY-MM-DD HH:mm:ss` strings on purpose: a String
// param in a DateTime64 position is parsed exactly like the literal it
// replaces, so the result sets cannot drift by a millisecond truncation.
//
// Cluster note (docs/ENVIRONMENT.md): `events`, `profiles`, `groups` and
// `cohort_members` are Distributed on Cloud. The identity-stitching and cohort
// `IN (SELECT ...)` subqueries, the profile/group LEFT ANY JOINs and any
// `IN (SELECT ...)` a filter compiles keep V1's exact shape and run under the
// client's `distributed_product_mode: 'allow'` as before — converting a query
// is not the place to change its cluster semantics. Every `IN` list binds as
// `Array(String)`, a literal list to the planner.

import { type SqlFragment, sql } from '@openpanel/db/src/clickhouse/sql';
import {
  EVENT_LIST_COLUMNS,
  type EventListColumn,
  QUERY_EVENTS_EQUALITY_COLUMNS,
  type QueryEventsEqualityColumn,
} from '../event.constants';
import { formatClickhouseDate } from './dates';
import {
  type CompiledFilterClauses,
  compiledFilterFragments,
} from './filter-clauses';

const TABLE = {
  events: 'events',
  eventsBots: 'events_bots',
  profiles: 'profiles',
  groups: 'groups',
  cohortMembers: 'cohort_members',
  eventNamesMv: 'distinct_event_names_mv',
  eventPropertyValuesMv: 'event_property_values_mv',
} as const;

/** What the profile-filter join may project besides `id`. */
const PROFILE_JOIN_COLUMNS = [
  'id',
  'first_name',
  'last_name',
  'email',
  'avatar',
  'properties',
  'is_external',
  'created_at',
  'last_seen_at',
  'groups',
] as const;

function optional(
  condition: unknown,
  fragment: () => SqlFragment
): SqlFragment {
  return condition ? fragment() : sql.empty;
}

function calendarDayRange(startDate: Date, endDate: Date): SqlFragment {
  return sql`toDate(created_at) BETWEEN toDate(${sql.string(formatClickhouseDate(startDate))}) AND toDate(${sql.string(formatClickhouseDate(endDate))})`;
}

export interface EventFilterJoins {
  /** Profile columns the compiled `profile.*` filters read; empty = no join. */
  profileColumns: readonly string[];
  /** Whether a compiled `group.*` filter reads the `_g` alias. */
  groups: boolean;
}

export const NO_FILTER_JOINS: EventFilterJoins = {
  profileColumns: [],
  groups: false,
};

/** The joins the compiled filters need, with V1's leading space; empty = none. */
function filterJoins(projectId: string, joins: EventFilterJoins): SqlFragment {
  const parts: SqlFragment[] = [];
  if (joins.profileColumns.length > 0) {
    const columns = sql.join(
      joins.profileColumns.map((column) =>
        sql.id(column, PROFILE_JOIN_COLUMNS)
      ),
      ', '
    );
    parts.push(
      sql`LEFT ANY JOIN (SELECT id, ${columns} FROM ${sql.id(TABLE.profiles)} FINAL WHERE project_id = ${sql.string(projectId)}) as profile on profile.id = profile_id`
    );
  }
  if (joins.groups) {
    parts.push(sql`ARRAY JOIN groups AS _group_id`);
    parts.push(
      sql`LEFT ANY JOIN (SELECT id, name, type, properties FROM ${sql.id(TABLE.groups)} FINAL WHERE project_id = ${sql.string(projectId)}) AS _g ON _g.id = _group_id`
    );
  }
  if (parts.length === 0) {
    return sql.empty;
  }
  return sql` ${sql.join(parts, ' ')}`;
}

export interface EventListQuery {
  projectId: string;
  columns: readonly EventListColumn[];
  take: number;
  /** Numeric cursor pages: `OFFSET` only when non-zero, as V1. */
  offset?: number;
  /** Date cursor pages: strict upper bound plus the lookback window. */
  cursor?: Date;
  /** The `created_at >= now|cursor - INTERVAL n DAY` narrowing; absent = none. */
  lookbackDays?: number;
  profileId?: string;
  sessionId?: string;
  groupId?: string;
  cohortId?: string;
  startDate?: Date;
  endDate?: Date;
  events?: readonly string[];
  filterClauses: CompiledFilterClauses;
  joins: EventFilterJoins;
  /** `event.conversions`' extra `name IN (..)`, appended after the filters as V1 did. */
  conversionNames?: readonly string[];
}

/** V1's `sb.where` in insertion order — the text has to match a cached V1 plan byte for byte. */
function eventListConditions(query: EventListQuery): SqlFragment[] {
  const conditions: SqlFragment[] = [];
  const projectId = sql.string(query.projectId);

  if (query.lookbackDays !== undefined) {
    const anchor = sql.string(formatClickhouseDate(query.cursor ?? new Date()));
    conditions.push(
      sql`created_at >= toDateTime64(${anchor}, 3) - INTERVAL ${sql.float64(query.lookbackDays)} DAY`
    );
  }
  if (query.cursor) {
    conditions.push(
      sql`created_at < ${sql.string(formatClickhouseDate(query.cursor))}`
    );
  }
  conditions.push(sql`project_id = ${projectId}`);

  if (query.profileId) {
    // Identity stitching: pre-identification anonymous events from devices
    // this profile has used, plus the profile's own identified events. The
    // `profile_id = device_id` guard keeps another user's identified events
    // out when a device_id collides (NAT, shared UA, server-side senders).
    const profileId = sql.string(query.profileId);
    conditions.push(
      sql`((device_id IN (SELECT device_id as did FROM ${sql.id(TABLE.events)} WHERE project_id = ${projectId} AND device_id != '' AND profile_id = ${profileId} group by did) AND profile_id = device_id) OR profile_id = ${profileId})`
    );
  }
  if (query.sessionId) {
    conditions.push(sql`session_id = ${sql.string(query.sessionId)}`);
  }
  if (query.groupId) {
    conditions.push(sql`has(groups, ${sql.string(query.groupId)})`);
  }
  if (query.cohortId) {
    conditions.push(
      sql`profile_id IN (SELECT profile_id FROM ${sql.id(TABLE.cohortMembers)} FINAL WHERE cohort_id = ${sql.string(query.cohortId)} AND project_id = ${projectId})`
    );
  }
  if (query.startDate && query.endDate) {
    conditions.push(calendarDayRange(query.startDate, query.endDate));
  }
  if (query.events && query.events.length > 0) {
    conditions.push(sql`name IN ${sql.array('String', query.events)}`);
  }
  conditions.push(...compiledFilterFragments(query.filterClauses));
  if (query.conversionNames && query.conversionNames.length > 0) {
    conditions.push(sql`name IN ${sql.array('String', query.conversionNames)}`);
  }
  return conditions;
}

function eventListWhere(query: EventListQuery): SqlFragment {
  const conditions = eventListConditions(query);
  return sql`WHERE ${sql.join(conditions, ' AND ')}`;
}

export function eventListQuery(query: EventListQuery): SqlFragment {
  const columns = sql.join(
    query.columns.map((column) => sql.id(column, EVENT_LIST_COLUMNS)),
    ', '
  );
  const joins = filterJoins(query.projectId, query.joins);
  return sql`SELECT ${columns} FROM ${sql.id(TABLE.events)} e${joins} ${eventListWhere(query)} ORDER BY created_at DESC, id ASC LIMIT ${sql.uint64(query.take)}${optional(
    query.offset,
    () => sql` OFFSET ${sql.uint64(query.offset as number)}`
  )}`;
}

export type EventsCountQuery = Pick<
  EventListQuery,
  | 'projectId'
  | 'profileId'
  | 'groupId'
  | 'cohortId'
  | 'startDate'
  | 'endDate'
  | 'events'
  | 'filterClauses'
  | 'joins'
>;

/** Same shape as the list minus paging; `profile_id = ..` here, not the stitching subquery. */
export function eventsCountQuery(query: EventsCountQuery): SqlFragment {
  const projectId = sql.string(query.projectId);
  const conditions: SqlFragment[] = [sql`project_id = ${projectId}`];
  if (query.profileId) {
    conditions.push(sql`profile_id = ${sql.string(query.profileId)}`);
  }
  if (query.groupId) {
    conditions.push(sql`has(groups, ${sql.string(query.groupId)})`);
  }
  if (query.cohortId) {
    conditions.push(
      sql`profile_id IN (SELECT profile_id FROM ${sql.id(TABLE.cohortMembers)} FINAL WHERE cohort_id = ${sql.string(query.cohortId)} AND project_id = ${projectId})`
    );
  }
  if (query.startDate && query.endDate) {
    conditions.push(calendarDayRange(query.startDate, query.endDate));
  }
  if (query.events && query.events.length > 0) {
    conditions.push(sql`name IN ${sql.array('String', query.events)}`);
  }
  conditions.push(...compiledFilterFragments(query.filterClauses));
  const joins = filterJoins(query.projectId, query.joins);
  return sql`SELECT count(*) as count FROM ${sql.id(TABLE.events)} e${joins} WHERE ${sql.join(conditions, ' AND ')}`;
}

const TOP_PAGES_WINDOW_DAYS = 30;

export function topPagesQuery(query: {
  projectId: string;
  take: number;
  offset: number;
  search?: string;
}): SqlFragment {
  return sql`
    SELECT path, count(*) as count, project_id, first_value(created_at) as first_seen, last_value(properties['__title']) as title, origin
    FROM ${sql.id(TABLE.events)}
    WHERE name = 'screen_view'
    AND  project_id = ${sql.string(query.projectId)}
    AND created_at > now() - INTERVAL ${sql.uint64(TOP_PAGES_WINDOW_DAYS)} DAY
    ${optional(query.search, () => sql`AND path ILIKE ${sql.string(`%${query.search}%`)}`)}
    GROUP BY path, project_id, origin
    ORDER BY count desc
    LIMIT ${sql.uint64(query.take)}
    OFFSET ${sql.uint64(query.offset)}
  `;
}

const BY_ID_WINDOW_MS = 1000;

/** `createdAt` narrows to a ±1s window so the primary key prunes the scan. */
export function eventByIdQuery(query: {
  projectId: string;
  id: string;
  createdAt?: Date;
}): SqlFragment {
  return sql`SELECT * FROM ${sql.id(TABLE.events)} WHERE project_id = ${sql.string(query.projectId)}${optional(
    query.createdAt,
    () => {
      const createdAt = query.createdAt as Date;
      const from = new Date(createdAt.getTime() - BY_ID_WINDOW_MS);
      const to = new Date(createdAt.getTime() + BY_ID_WINDOW_MS);
      return sql` AND created_at BETWEEN ${sql.string(formatClickhouseDate(from))} AND ${sql.string(formatClickhouseDate(to))}`;
    }
  )} AND id = ${sql.string(query.id)} LIMIT 1`;
}

const TOP_EVENT_NAMES_LIMIT = 50;

export function topEventNamesQuery(projectId: string): SqlFragment {
  return sql`SELECT name, count() as count FROM ${sql.id(TABLE.eventNamesMv)} WHERE project_id = ${sql.string(projectId)} GROUP BY name ORDER BY count DESC LIMIT ${sql.uint64(TOP_EVENT_NAMES_LIMIT)}`;
}

const EVENT_PROPERTIES_LIMIT = 500;

// GROUP BY rather than DISTINCT: same (property_key, name) set, but a
// multi-column DISTINCT cannot use the epv_keys aggregating projection and
// degrades to a full scan of the project's MV slice. `name` tie-breaks the
// ORDER BY so the LIMIT window is deterministic.
export function eventPropertiesQuery(query: {
  projectId: string;
  eventName?: string;
}): SqlFragment {
  return sql`SELECT property_key, name as event_name FROM ${sql.id(TABLE.eventPropertyValuesMv)} WHERE project_id = ${sql.string(query.projectId)}${optional(
    query.eventName,
    () => sql` AND name = ${sql.string(query.eventName as string)}`
  )} GROUP BY property_key, name ORDER BY property_key ASC, name ASC LIMIT ${sql.uint64(EVENT_PROPERTIES_LIMIT)}`;
}

const EVENT_PROPERTY_VALUES_LIMIT = 200;

export function eventPropertyValuesQuery(query: {
  projectId: string;
  eventName: string;
  propertyKey: string;
}): SqlFragment {
  return sql`SELECT property_value as value FROM ${sql.id(TABLE.eventPropertyValuesMv)} WHERE project_id = ${sql.string(query.projectId)} AND name = ${sql.string(query.eventName)} AND property_key = ${sql.string(query.propertyKey)} ORDER BY created_at DESC LIMIT ${sql.uint64(EVENT_PROPERTY_VALUES_LIMIT)}`;
}

export interface QueryEventsQuery {
  projectId: string;
  sessionId?: string;
  profileId?: string;
  profileIds?: readonly string[];
  eventNames?: readonly string[];
  equals: Partial<Record<QueryEventsEqualityColumn, string>>;
  properties?: Record<string, string>;
  /** Already resolved `YYYY-MM-DD HH:mm:ss` bounds; absent = no date clause. */
  dateRange?: { start: string; end: string };
  filterClauses: CompiledFilterClauses;
  limit: number;
}

function queryEventsConditions(query: QueryEventsQuery): SqlFragment[] {
  const conditions: SqlFragment[] = [
    sql`project_id = ${sql.string(query.projectId)}`,
  ];
  if (query.sessionId) {
    conditions.push(sql`session_id = ${sql.string(query.sessionId)}`);
  }
  if (query.profileId) {
    conditions.push(sql`profile_id = ${sql.string(query.profileId)}`);
  }
  if (query.profileIds?.length) {
    conditions.push(
      sql`profile_id IN ${sql.array('String', query.profileIds)}`
    );
  }
  if (query.eventNames?.length) {
    conditions.push(sql`name IN ${sql.array('String', query.eventNames)}`);
  }
  for (const column of QUERY_EVENTS_EQUALITY_COLUMNS) {
    const value = query.equals[column];
    if (value) {
      conditions.push(
        sql`${sql.id(column, QUERY_EVENTS_EQUALITY_COLUMNS)} = ${sql.string(value)}`
      );
    }
  }
  if (query.properties) {
    for (const [key, value] of Object.entries(query.properties)) {
      conditions.push(
        sql`properties[${sql.string(key)}] = ${sql.string(value)}`
      );
    }
  }
  if (query.dateRange) {
    conditions.push(
      sql`created_at BETWEEN ${sql.string(query.dateRange.start)} AND ${sql.string(query.dateRange.end)}`
    );
  }
  conditions.push(...compiledFilterFragments(query.filterClauses));
  return conditions;
}

export function queryEventsQuery(query: QueryEventsQuery): SqlFragment {
  return sql`SELECT * FROM ${sql.id(TABLE.events)} WHERE ${sql.join(
    queryEventsConditions(query),
    ' AND '
  )} LIMIT ${sql.uint64(query.limit)}`;
}

// ---- packages/trpc/src/routers/event.ts's inline queries

export function botEventsQuery(query: {
  projectId: string;
  limit: number;
  offset: number;
}): SqlFragment {
  return sql`SELECT * FROM ${sql.id(TABLE.eventsBots)} WHERE project_id = ${sql.string(query.projectId)} ORDER BY created_at DESC LIMIT ${sql.uint64(query.limit)} OFFSET ${sql.uint64(query.offset)}`;
}

export function botEventsCountQuery(projectId: string): SqlFragment {
  return sql`SELECT count(*) as count FROM ${sql.id(TABLE.eventsBots)} WHERE project_id = ${sql.string(projectId)}`;
}

const ORIGINS_WINDOW_DAYS = 30;
const ORIGINS_LIMIT = 3;

export function topOriginsQuery(projectId: string): SqlFragment {
  return sql`SELECT DISTINCT origin, count(id) as count FROM ${sql.id(TABLE.events)} WHERE project_id = ${sql.string(projectId)} AND origin IS NOT NULL AND origin != '' AND toDate(created_at) > now() - INTERVAL ${sql.uint64(ORIGINS_WINDOW_DAYS)} DAY GROUP BY origin ORDER BY count DESC LIMIT ${sql.uint64(ORIGINS_LIMIT)}`;
}
