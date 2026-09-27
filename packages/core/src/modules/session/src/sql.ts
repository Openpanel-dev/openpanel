// Every ClickHouse query the session module runs, as pure `sql` fragments
// (ADR-013). Converted 1:1 from packages/db/src/services/session.service.ts
// and apps/worker/src/jobs/events.create-session-end.ts (M7-001): the SQL text
// is V1's, with every value bound as a `{pN:Type}` parameter instead of an
// escaped literal, and each conversion was proven byte-equivalent against the
// local prod-copy (see the task report).
//
// Dates bind as V1's own `YYYY-MM-DD HH:mm:ss` strings on purpose: a String
// param in a DateTime64 position is parsed exactly like the literal it
// replaces, so the result sets cannot drift by a millisecond truncation.
//
// Cluster note (docs/ENVIRONMENT.md): `sessions` and `session_replay_chunks`
// are Distributed on Cloud. The has_replay LEFT JOIN subquery and any
// `IN (SELECT ...)` a filter compiles to keep V1's exact shape and run under
// the client's `distributed_product_mode: 'allow'` as before — converting a
// query is not the place to change its cluster semantics.

import { type SqlFragment, sql } from '@openpanel/db/src/clickhouse/sql';
import { toRangeBoundaryLiteral } from '../../../shared/ch-dates';
import { formatClickhouseDate } from './dates';
import {
  type CompiledFilterClauses,
  spliceCompiledFilters,
} from './filter-clauses';

const TABLE = {
  sessions: 'sessions',
  sessionReplayChunks: 'session_replay_chunks',
  events: 'events',
} as const;

/** The list page's projection — `IClickhouseSession` minus what the table never renders. */
const SESSION_LIST_COLUMNS = [
  'created_at',
  'ended_at',
  'id',
  'profile_id',
  'entry_path',
  'exit_path',
  'duration',
  'is_bounce',
  'referrer_name',
  'referrer',
  'country',
  'city',
  'os',
  'browser',
  'brand',
  'model',
  'device',
  'screen_view_count',
  'event_count',
  'revenue',
  'groups',
] as const;

export const SESSION_DISTINCT_FIELDS = [
  'referrer_name',
  'country',
  'os',
  'browser',
  'device',
] as const;

export type SessionDistinctField = (typeof SESSION_DISTINCT_FIELDS)[number];

const DISTINCT_VALUES_LOOKBACK_DAYS = 90;

function searchCondition(search: string): SqlFragment {
  const pattern = sql.string(`%${search}%`);
  return sql`AND (entry_path ILIKE ${pattern} OR exit_path ILIKE ${pattern} OR referrer ILIKE ${pattern} OR referrer_name ILIKE ${pattern})`;
}

function calendarDayRange(startDate: Date, endDate: Date): SqlFragment {
  return sql`AND toDate(created_at) BETWEEN toDate(${sql.string(formatClickhouseDate(startDate))}) AND toDate(${sql.string(formatClickhouseDate(endDate))})`;
}

function optional(
  condition: boolean | string | undefined | null,
  fragment: () => SqlFragment
): SqlFragment {
  return condition ? fragment() : sql.empty;
}

export interface SessionListQuery {
  projectId: string;
  take: number;
  /** Anchors the lookback window and the `created_at <` page boundary. */
  cursor?: Date;
  /** Already capped by the caller (lookback.ts ceiling). */
  lookbackDays: number;
  startDate?: Date;
  endDate?: Date;
  profileId?: string;
  search?: string;
  filterClauses?: CompiledFilterClauses;
}

/** V1 only skips the lookback window when a page is bounded by explicit dates. */
export function hasSessionListLookback(query: {
  cursor?: Date;
  startDate?: Date;
  endDate?: Date;
}): boolean {
  return (
    query.cursor instanceof Date ||
    !(query.cursor || (query.startDate && query.endDate))
  );
}

// The rows of `sessions` this list page may show: project, lookback window,
// cursor boundary and calendar-day range. The −1 subquery repeats these so it
// only holds the window's unmerged backlog; a −1 is a copy of its +1, so it
// shares that row's `created_at` and falls in the same window.
function sessionListWindow(query: SessionListQuery): SqlFragment {
  const { projectId, cursor, lookbackDays, startDate, endDate } = query;
  const hasDateRange = Boolean(startDate && endDate);
  const lookbackAnchor = sql.string(formatClickhouseDate(cursor ?? new Date()));

  return sql`project_id = ${sql.string(projectId)}
      ${optional(
        hasSessionListLookback(query),
        () =>
          sql`AND created_at >= toDateTime64(${lookbackAnchor}, 3) - INTERVAL ${sql.float64(lookbackDays)} DAY`
      )}
      ${optional(
        cursor instanceof Date,
        () =>
          sql`AND created_at < ${sql.string(formatClickhouseDate(cursor as Date))}`
      )}
      ${optional(hasDateRange, () =>
        calendarDayRange(startDate as Date, endDate as Date)
      )}`;
}

// No `FINAL`: it read every column of the whole window and blocked read-in-order
// (chatpaper 1.1 s → 0.15 s, M38-002 / M39-004, see sql.proof.md). A +1 whose
// `(id, version)` has a −1 is a pending collapse, which `FINAL` would have
// removed. Plain `sign = 1` alone returns those stale rows, and `LIMIT 1 BY id`
// drops the orphan +1 duplicates `FINAL` keeps. `GLOBAL` builds the −1 set once
// on the initiator instead of once per shard (docs/ENVIRONMENT.md).
export function sessionListQuery(query: SessionListQuery): SqlFragment {
  const { projectId, take, lookbackDays, profileId, search } = query;
  const { filterClauses = {} } = query;

  return sql`
    SELECT ${sql.join(
      SESSION_LIST_COLUMNS.map((column) => sql.id(column, SESSION_LIST_COLUMNS))
    )}, toBool(src.session_id != '') as hasReplay
    FROM ${sql.id(TABLE.sessions)}
    LEFT JOIN (
      SELECT DISTINCT session_id
      FROM ${sql.id(TABLE.sessionReplayChunks)}
      WHERE project_id = ${sql.string(projectId)}
        AND started_at > now() - INTERVAL ${sql.float64(lookbackDays)} DAY
    ) AS src ON src.session_id = id
    WHERE ${sessionListWindow(query)}
      AND sign = 1
      AND (id, version) GLOBAL NOT IN (
        SELECT id, version
        FROM ${sql.id(TABLE.sessions)}
        WHERE ${sessionListWindow(query)}
          AND sign = -1
      )
      ${optional(profileId, () => sql`AND profile_id = ${sql.string(profileId as string)}`)}
      ${optional(search, () => searchCondition(search as string))}
      ${spliceCompiledFilters(filterClauses)}
    ORDER BY created_at DESC
    LIMIT ${sql.uint64(take)}
  `;
}

export interface SessionsCountQuery {
  projectId: string;
  profileId?: string;
  startDate?: Date;
  endDate?: Date;
  search?: string;
  filterClauses?: CompiledFilterClauses;
}

export function sessionsCountQuery(query: SessionsCountQuery): SqlFragment {
  const {
    projectId,
    profileId,
    startDate,
    endDate,
    search,
    filterClauses = {},
  } = query;
  const hasDateRange = Boolean(startDate && endDate);

  return sql`
    SELECT count(*) as count
    FROM ${sql.id(TABLE.sessions)}
    WHERE project_id = ${sql.string(projectId)}
      AND sign = 1
      ${optional(profileId, () => sql`AND profile_id = ${sql.string(profileId as string)}`)}
      ${optional(hasDateRange, () =>
        calendarDayRange(startDate as Date, endDate as Date)
      )}
      ${optional(search, () => searchCondition(search as string))}
      ${spliceCompiledFilters(filterClauses)}
  `;
}

export function sessionReplayChunksQuery(query: {
  sessionId: string;
  projectId: string;
  /** Page size + 1, so the caller can tell whether another page exists. */
  limit: number;
  offset: number;
}): SqlFragment {
  return sql`
    SELECT chunk_index, payload
    FROM ${sql.id(TABLE.sessionReplayChunks)}
    WHERE session_id = ${sql.string(query.sessionId)}
      AND project_id = ${sql.string(query.projectId)}
    ORDER BY started_at, ended_at, chunk_index
    LIMIT ${sql.uint64(query.limit)}
    OFFSET ${sql.uint64(query.offset)}
  `;
}

export function sessionDistinctValuesQuery(query: {
  projectId: string;
  field: SessionDistinctField;
  limit: number;
}): SqlFragment {
  const column = sql.id(query.field, SESSION_DISTINCT_FIELDS);
  return sql`
    SELECT ${column} AS value, count() AS cnt
    FROM ${sql.id(TABLE.sessions)}
    WHERE project_id = ${sql.string(query.projectId)}
      AND ${column} != ''
      AND sign = 1
      AND created_at > now() - INTERVAL ${sql.uint64(DISTINCT_VALUES_LOOKBACK_DAYS)} DAY
    GROUP BY value
    ORDER BY cnt DESC
    LIMIT ${sql.uint64(query.limit)}
  `;
}

export function sessionByIdQuery(query: {
  sessionId: string;
  projectId: string;
}): SqlFragment {
  // FINAL turns off automatic PREWHERE, so without it every column is read for
  // every granule FINAL widens the id's skip-index hit to. Safe before the
  // merge: a -1 row is a copy of its +1, so both pass. `sign` must stay in
  // WHERE — filtering it first drops the -1 and resurrects the stale +1.
  return sql`
    SELECT *
    FROM ${sql.id(TABLE.sessions)} FINAL
    PREWHERE id = ${sql.string(query.sessionId)}
      AND project_id = ${sql.string(query.projectId)}
    WHERE sign = 1
  `;
}

export function sessionHasReplayQuery(query: {
  sessionId: string;
  projectId: string;
}): SqlFragment {
  return sql`
    SELECT 1 AS n
    FROM ${sql.id(TABLE.sessionReplayChunks)}
    WHERE session_id = ${sql.string(query.sessionId)}
      AND project_id = ${sql.string(query.projectId)}
    LIMIT 1
  `;
}

/** The equality filters `querySessionsCore` accepts, in V1's clause order. */
const QUERY_SESSIONS_EQUALITY_COLUMNS = [
  ['profileId', 'profile_id'],
  ['referrer', 'referrer'],
  ['referrerName', 'referrer_name'],
  ['referrerType', 'referrer_type'],
  ['device', 'device'],
  ['country', 'country'],
  ['city', 'city'],
  ['os', 'os'],
  ['browser', 'browser'],
] as const;

type QuerySessionsEqualityKey =
  (typeof QUERY_SESSIONS_EQUALITY_COLUMNS)[number][0];

export interface QuerySessionsQuery
  extends Partial<Record<QuerySessionsEqualityKey, string>> {
  projectId: string;
  /** `YYYY-MM-DD HH:mm:ss`, inclusive on both ends — what clix.datetime sent. */
  startDate: string;
  endDate: string;
  limit: number;
  filterClauses?: CompiledFilterClauses;
}

/**
 * Without an explicit order ClickHouse returns whatever it reads first, so a
 * bare LIMIT hands back the oldest sessions in the window while the MCP tool
 * labels them `created_at desc`. The events twin took the same fix in #476.
 */
export function querySessionsQuery(query: QuerySessionsQuery): SqlFragment {
  const equalities = QUERY_SESSIONS_EQUALITY_COLUMNS.filter(
    ([key]) => query[key]
  ).map(
    ([key, column]) =>
      sql`AND ${sql.id(column)} = ${sql.string(query[key] as string)}`
  );

  return sql`
    SELECT *
    FROM ${sql.id(TABLE.sessions)}
    WHERE project_id = ${sql.string(query.projectId)}
      AND sign = 1
      ${sql.join(equalities, ' ')}
      AND created_at BETWEEN ${sql.string(toRangeBoundaryLiteral(query.startDate, 'start'))} AND ${sql.string(toRangeBoundaryLiteral(query.endDate, 'end'))}
      ${spliceCompiledFilters(query.filterClauses ?? {})}
    ORDER BY created_at DESC
    LIMIT ${sql.uint64(query.limit)}
  `;
}

/** A closed session's events, newest first, for funnel-rule matching. */
export function sessionEventsQuery(query: {
  sessionId: string;
  projectId: string;
  startAt: Date;
  endAt: Date;
  limit: number;
}): SqlFragment {
  return sql`
    SELECT *
    FROM ${sql.id(TABLE.events)}
    WHERE session_id = ${sql.string(query.sessionId)}
      AND project_id = ${sql.string(query.projectId)}
      AND created_at BETWEEN ${sql.string(formatClickhouseDate(query.startAt))} AND ${sql.string(formatClickhouseDate(query.endAt))}
    ORDER BY created_at DESC
    LIMIT ${sql.uint64(query.limit)}
  `;
}
