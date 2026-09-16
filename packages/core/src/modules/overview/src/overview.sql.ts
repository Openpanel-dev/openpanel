// Every ClickHouse query OverviewService runs, as pure `sql` fragments
// (ADR-013). Converted 1:1 from packages/db/src/services/overview.service.ts
// (clix): the SQL text is V1's, with every value — project id, dates,
// timezone, event/column names, limits — bound as a `{pN:Type}` parameter
// instead of an escaped literal or clix's inline string interpolation. Each
// builder's result set was diffed against V1's on the local prod-copy; the
// statements, params, row counts and timings are in overview.sql.proof.md.
//
// Both filter compilers and the field resolver return fragments now (M12-002,
// M12-003) and are interpolated directly. `compiledText` is left with one job
// here: the `INTERVAL <n> <unit>` step keyword in a WITH FILL clause, which is
// SQL syntax, not a value.
//
// `toStartOf`/`toInterval`/`datetime` reproduce V1's `clix` static helpers
// verbatim (query-builder.ts) rather than chart.sql.ts's own `intervalBucket`:
// notably V1's overview never passed a timezone into `toStartOfWeek`/
// `toStartOfMonth` — ClickHouse resolves those from the query's
// `session_timezone` setting instead, which every statement here still sets
// (see src/run-query.ts).

import { type SqlFragment, sql } from '@openpanel/db/src/clickhouse/sql';
import { compiledText } from '../../chart/src/compiled';
import { getSelectPropertyKey } from '../../chart/src/field-resolution';
import type { IInterval } from '../../report/report.constants';

const ROLLUP_DATE_PREFIX = '1970-01-01';

export type OverviewTable = 'events' | 'sessions';

function toDateTimeLiteral(value: string): string {
  return new Date(value).toISOString().slice(0, 19).replace('T', ' ');
}

function toDateLiteral(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

/** V1 `clix.toStartOf` — deliberately timezone-blind for week/month (see header). */
export function toStartOf(node: string, interval: IInterval): SqlFragment {
  switch (interval) {
    case 'minute':
      return sql`toStartOfMinute(${sql.id(node)})`;
    case 'hour':
      return sql`toStartOfHour(${sql.id(node)})`;
    case 'day':
      return sql`toStartOfDay(${sql.id(node)})`;
    case 'week':
      return sql`toStartOfWeek(toDateTime(${sql.id(node)}))`;
    case 'month':
      return sql`toStartOfMonth(toDateTime(${sql.id(node)}))`;
    default:
      throw new Error(`Unsupported overview interval: ${String(interval)}`);
  }
}

/** V1 `clix.toInterval`. */
function toIntervalStep(interval: IInterval): string {
  switch (interval) {
    case 'minute':
      return 'toIntervalMinute(1)';
    case 'hour':
      return 'toIntervalHour(1)';
    case 'day':
      return 'toIntervalDay(1)';
    case 'week':
      return 'toIntervalWeek(1)';
    case 'month':
      return 'toIntervalMonth(1)';
    default:
      throw new Error(`Unsupported overview interval: ${String(interval)}`);
  }
}

/**
 * `getFillConfig`: `WITH FILL` needs FROM/TO to actually evaluate to a
 * Date/DateTime constant, not a bare string — V1 got this from `clix`'s
 * `toStartOf`/`datetime` helpers, which return SQL *expressions*
 * (`toStartOfMonth(toDateTime(toDate('...')))`), never a plain literal.
 * `sql.date`/`sql.dateTime64` bind the boundary itself; the wrapping
 * functions around them reproduce that expression shape.
 */
function fillBoundaryParam(interval: IInterval, value: string) {
  // The bucket column's type must match exactly: `toStartOfX(created_at)`
  // returns plain `DateTime`/`Date`, not `DateTime64` — ClickHouse's WITH
  // FILL rejects a boundary whose type doesn't match the sorted column's.
  return interval === 'month' || interval === 'week'
    ? sql.date(toDateLiteral(value))
    : sql.param('DateTime', toDateTimeLiteral(value));
}

/** V1 always bucket-aligns FROM (via `toStartOf`) but leaves TO as-is. */
function fillFrom(interval: IInterval, startDate: string): SqlFragment {
  const boundary = fillBoundaryParam(interval, startDate);
  switch (interval) {
    case 'minute':
      return sql`toStartOfMinute(${boundary})`;
    case 'hour':
      return sql`toStartOfHour(${boundary})`;
    case 'day':
      return sql`toStartOfDay(${boundary})`;
    case 'week':
      return sql`toStartOfWeek(toDateTime(${boundary}))`;
    case 'month':
      return sql`toStartOfMonth(toDateTime(${boundary}))`;
    default:
      throw new Error(`Unsupported overview interval: ${String(interval)}`);
  }
}

export function fillClause(
  interval: IInterval,
  startDate: string,
  endDate: string
): SqlFragment {
  return sql`WITH FILL FROM ${fillFrom(interval, startDate)} TO ${fillBoundaryParam(interval, endDate)} STEP ${compiledText(toIntervalStep(interval))}`;
}

function dateRangeWhere(
  column: string,
  startDate: string,
  endDate: string
): SqlFragment {
  return sql`${sql.id(column)} BETWEEN toDateTime(${sql.string(toDateTimeLiteral(startDate))}) AND toDateTime(${sql.string(toDateTimeLiteral(endDate))})`;
}

/** `getRawWhereClause`'s output — already a bound fragment, or nothing. */
function rawWhere(where: SqlFragment | null): SqlFragment {
  return where ? sql`AND ${where}` : sql.empty;
}

// --- revenue -----------------------------------------------------------------

export interface RevenueQueryInput {
  projectId: string;
  startDate: string;
  endDate: string;
  interval: IInterval;
  rawFilterWhere: SqlFragment | null;
}

export function revenueQuery(input: RevenueQueryInput): SqlFragment {
  return sql`
    SELECT
      ${toStartOf('created_at', input.interval)} AS date,
      sum(revenue) AS total_revenue
    FROM events
    WHERE project_id = ${sql.string(input.projectId)}
      AND name = 'revenue'
      AND revenue > 0
      AND ${dateRangeWhere('created_at', input.startDate, input.endDate)}
      ${rawWhere(input.rawFilterWhere)}
    GROUP BY date
    WITH ROLLUP
  `;
}

// --- metrics: sessions-only path ----------------------------------------------

export interface SessionMetricsQueryInput {
  projectId: string;
  startDate: string;
  endDate: string;
  interval: IInterval;
  rawFilterWhere: SqlFragment | null;
}

export function sessionMetricsQuery(
  input: SessionMetricsQueryInput
): SqlFragment {
  return sql`
    SELECT
      ${toStartOf('created_at', input.interval)} AS date,
      round(sum(sign * is_bounce) * 100.0 / sum(sign), 2) as bounce_rate,
      uniqIf(profile_id, sign > 0) AS unique_visitors,
      sum(sign) AS total_sessions,
      round(avgIf(duration, duration > 0 AND sign > 0), 2) / 1000 AS _avg_session_duration,
      if(isNaN(_avg_session_duration), 0, _avg_session_duration) AS avg_session_duration,
      sum(sign * screen_view_count) AS total_screen_views,
      round(sum(sign * screen_view_count) * 1.0 / sum(sign), 2) AS views_per_session
    FROM sessions
    WHERE ${dateRangeWhere('created_at', input.startDate, input.endDate)}
      AND project_id = ${sql.string(input.projectId)}
      ${rawWhere(input.rawFilterWhere)}
    GROUP BY date
    WITH ROLLUP
    HAVING sum(sign) > 0
    ORDER BY date ASC
    ${fillClause(input.interval, input.startDate, input.endDate)}
  `;
}

// --- metrics: page-filtered path -----------------------------------------------

export interface PageFilterMetricsQueryInput {
  projectId: string;
  startDate: string;
  endDate: string;
  interval: IInterval;
  rawSessionFilterWhere: SqlFragment | null;
  rawEventFilterWhere: SqlFragment | null;
}

function rollupDateLiteral(interval: IInterval): SqlFragment {
  return interval === 'month' || interval === 'week'
    ? sql`toDate(${sql.string(ROLLUP_DATE_PREFIX)})`
    : sql`toDateTime(${sql.string(`${ROLLUP_DATE_PREFIX} 00:00:00`)})`;
}

export function metricsWithPageFilterQuery(
  input: PageFilterMetricsQueryInput
): SqlFragment {
  const rollupDate = rollupDateLiteral(input.interval);
  const dateBucket = toStartOf('created_at', input.interval);

  // One pass over `events`, carrying the per-row duration the daily average
  // needs alongside the columns every other metric aggregates. A CTE is
  // re-executed once per reference, so each source is read exactly once here
  // and the window-wide totals are lifted off its own `WITH ROLLUP` row rather
  // than from a second scan (M28-001).
  const filteredScreenViews = sql`
    SELECT
      ${dateBucket} AS date,
      profile_id,
      session_id,
      dateDiff('millisecond', created_at, lead(created_at, 1, created_at) OVER (PARTITION BY session_id ORDER BY created_at)) AS duration
    FROM events
    WHERE project_id = ${sql.string(input.projectId)}
      AND name = 'screen_view'
      AND ${dateRangeWhere('created_at', input.startDate, input.endDate)}
      ${rawWhere(input.rawEventFilterWhere)}
  `;

  const eventAgg = sql`
    SELECT
      date,
      uniq(profile_id) AS unique_visitors,
      uniq(session_id) AS total_sessions,
      count(*) AS total_screen_views,
      round((count(*) * 1.) / uniq(session_id), 2) AS views_per_session,
      round(avgIf(duration, duration > 0), 2) / 1000 AS avg_session_duration
    FROM filtered_screen_views
    GROUP BY date
    WITH ROLLUP
  `;

  const sessionAgg = sql`
    SELECT
      ${dateBucket} AS date,
      round((countIf(is_bounce = 1 AND sign = 1) * 100.) / countIf(sign = 1), 2) AS bounce_rate
    FROM sessions FINAL
    WHERE sign = 1
      AND project_id = ${sql.string(input.projectId)}
      AND ${dateRangeWhere('created_at', input.startDate, input.endDate)}
      ${rawWhere(input.rawSessionFilterWhere)}
    GROUP BY date
    WITH ROLLUP
    ORDER BY date ASC
  `;

  // `max(if(<rollup row>, x, NULL)) OVER ()` broadcasts the totals row's value
  // onto every daily row, and stays NULL when the aggregate produced no rollup
  // row at all — which is the nullability the old scalar subqueries had, and
  // which `getMetricsWithPageFilter` reads to tell "no data" from "zero".
  const overallOf = (column: string): SqlFragment =>
    sql`max(if(date = ${rollupDate}, ${sql.id(column)}, NULL)) OVER ()`;

  const eventStats = sql`
    SELECT
      date,
      unique_visitors,
      total_sessions,
      total_screen_views,
      views_per_session,
      avg_session_duration,
      ${overallOf('unique_visitors')} AS overall_unique_visitors,
      ${overallOf('total_sessions')} AS overall_total_sessions
    FROM event_agg
  `;

  const sessionStats = sql`
    SELECT date, bounce_rate, ${overallOf('bounce_rate')} AS overall_bounce_rate
    FROM session_agg
  `;

  // Both sides keep their rollup row through the join so that the two totals
  // rows meet each other: that pairing is what carries `overall_bounce_rate`
  // onto days the session aggregate has no row for. The rollup row itself is
  // dropped afterwards, once the window function has read it.
  const joined = sql`
    SELECT
      e.date AS date,
      s.bounce_rate AS bounce_rate,
      e.unique_visitors AS unique_visitors,
      e.total_sessions AS total_sessions,
      e.avg_session_duration AS avg_session_duration,
      e.total_screen_views AS total_screen_views,
      e.views_per_session AS views_per_session,
      e.overall_unique_visitors AS overall_unique_visitors,
      e.overall_total_sessions AS overall_total_sessions,
      max(s.overall_bounce_rate) OVER () AS overall_bounce_rate
    FROM event_stats AS e
    LEFT JOIN session_stats AS s ON e.date = s.date
  `;

  return sql`
    WITH
      filtered_screen_views AS (${filteredScreenViews}),
      event_agg AS (${eventAgg}),
      event_stats AS (${eventStats}),
      session_agg AS (${sessionAgg}),
      session_stats AS (${sessionStats}),
      joined AS (${joined})
    SELECT
      date,
      bounce_rate,
      unique_visitors,
      total_sessions,
      avg_session_duration,
      total_screen_views,
      views_per_session,
      overall_unique_visitors,
      overall_total_sessions,
      overall_bounce_rate
    FROM joined
    WHERE date != ${rollupDate}
    ORDER BY date ASC
    ${fillClause(input.interval, input.startDate, input.endDate)}
  `;
}

// --- top pages -----------------------------------------------------------------

export interface TopPagesQueryInput {
  projectId: string;
  startDate: string;
  endDate: string;
  rawFilterWhere: SqlFragment | null;
  limit: number;
}

export function topPagesQuery(input: TopPagesQueryInput): SqlFragment {
  return sql`
    SELECT
      origin,
      path,
      uniq(session_id) as sessions,
      count() as pageviews,
      sum(revenue) as revenue
    FROM events
    WHERE project_id = ${sql.string(input.projectId)}
      AND name = 'screen_view'
      AND path != ''
      AND ${dateRangeWhere('created_at', input.startDate, input.endDate)}
      ${rawWhere(input.rawFilterWhere)}
    GROUP BY origin, path
    ORDER BY sessions DESC
    LIMIT ${sql.uint64(input.limit)}
  `;
}

// --- top entry/exit --------------------------------------------------------------

export interface DistinctSessionsQueryInput {
  projectId: string;
  startDate: string;
  endDate: string;
  rawFilterWhere: SqlFragment | null;
}

export function distinctSessionsQuery(
  input: DistinctSessionsQueryInput
): SqlFragment {
  return sql`
    SELECT DISTINCT session_id
    FROM events
    WHERE project_id = ${sql.string(input.projectId)}
      AND ${dateRangeWhere('created_at', input.startDate, input.endDate)}
      ${rawWhere(input.rawFilterWhere)}
  `;
}

/**
 * `withDistinctSessionsIfNeeded`: when the caller filtered by `path`, a
 * `sessions`-scoped query is redirected through the set of session ids that
 * actually match the page filter on `events`, instead of applying the
 * filters directly to `sessions` (which has no `path` column of its own).
 * Threaded as a WHERE clause, not appended after the finished query text —
 * V1's `.merge()` is equivalent to inserting one more AND'd condition, and
 * doing that after `LIMIT` is invalid SQL.
 */
function distinctSessionsCteHeader(cte: SqlFragment | null): SqlFragment {
  return cte ? sql`WITH distinct_sessions AS (${cte})` : sql.empty;
}

function distinctSessionsConstraint(cte: SqlFragment | null): SqlFragment {
  return cte
    ? sql`AND id IN (SELECT session_id FROM distinct_sessions)`
    : sql.empty;
}

export interface TopEntryExitQueryInput {
  projectId: string;
  startDate: string;
  endDate: string;
  mode: 'entry' | 'exit';
  limit: number;
  /** Mutually exclusive with `distinctSessionsCte`, exactly as V1's `withDistinctSessionsIfNeeded`. */
  rawFilterWhere: SqlFragment | null;
  distinctSessionsCte: SqlFragment | null;
}

export function topEntryExitQuery(input: TopEntryExitQueryInput): SqlFragment {
  const [originCol, pathCol] =
    input.mode === 'entry'
      ? ['entry_origin', 'entry_path']
      : ['exit_origin', 'exit_path'];
  return sql`
    ${distinctSessionsCteHeader(input.distinctSessionsCte)}
    SELECT
      ${sql.id(originCol)} AS origin,
      ${sql.id(pathCol)} AS path,
      sum(sign) as sessions,
      sum(sign * screen_view_count) as pageviews,
      sum(revenue * sign) as revenue
    FROM sessions
    WHERE project_id = ${sql.string(input.projectId)}
      AND ${dateRangeWhere('created_at', input.startDate, input.endDate)}
      ${
        input.distinctSessionsCte
          ? distinctSessionsConstraint(input.distinctSessionsCte)
          : rawWhere(input.rawFilterWhere)
      }
    GROUP BY ${sql.id(originCol)}, ${sql.id(pathCol)}
    HAVING sum(sign) > 0
    ORDER BY sessions DESC
    LIMIT ${sql.uint64(input.limit)}
  `;
}

// --- top generic (breakdown by a single dimension) ------------------------------

/** `column`/`prefixColumn` are drawn from a closed zod enum upstream — bound
 * as identifiers here rather than trusted as pre-validated text (R3). */
const TOP_GENERIC_COLUMNS = [
  'referrer',
  'referrer_name',
  'referrer_type',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'region',
  'country',
  'city',
  'device',
  'brand',
  'model',
  'browser',
  'browser_version',
  'os',
  'os_version',
] as const;
const TOP_GENERIC_PREFIX_COLUMNS = ['country', 'browser', 'os'] as const;

export interface TopGenericQueryInput {
  projectId: string;
  startDate: string;
  endDate: string;
  column: string;
  prefixColumn: string | null;
  limit: number;
  /** Mutually exclusive with `distinctSessionsCte`, exactly as V1's `withDistinctSessionsIfNeeded`. */
  rawFilterWhere: SqlFragment | null;
  distinctSessionsCte: SqlFragment | null;
}

function topGenericSelect(
  column: string,
  prefixColumn: string | null
): SqlFragment {
  const parts: SqlFragment[] = [];
  if (prefixColumn) {
    parts.push(
      sql`${sql.id(prefixColumn, TOP_GENERIC_PREFIX_COLUMNS)} as prefix`
    );
  }
  parts.push(
    sql`nullIf(${sql.id(column, TOP_GENERIC_COLUMNS)}, '') as name`,
    sql`sum(sign) as sessions`,
    sql`sum(sign * screen_view_count) as pageviews`,
    sql`sum(revenue * sign) as revenue`
  );
  return sql.join(parts);
}

function topGenericGroupBy(
  column: string,
  prefixColumn: string | null
): SqlFragment {
  return prefixColumn
    ? sql`${sql.id(prefixColumn, TOP_GENERIC_PREFIX_COLUMNS)}, ${sql.id(column, TOP_GENERIC_COLUMNS)}`
    : sql.id(column, TOP_GENERIC_COLUMNS);
}

export function topGenericQuery(input: TopGenericQueryInput): SqlFragment {
  return sql`
    ${distinctSessionsCteHeader(input.distinctSessionsCte)}
    SELECT ${topGenericSelect(input.column, input.prefixColumn)}
    FROM sessions
    WHERE project_id = ${sql.string(input.projectId)}
      AND ${dateRangeWhere('created_at', input.startDate, input.endDate)}
      ${
        input.distinctSessionsCte
          ? distinctSessionsConstraint(input.distinctSessionsCte)
          : rawWhere(input.rawFilterWhere)
      }
    GROUP BY ${topGenericGroupBy(input.column, input.prefixColumn)}
    HAVING sum(sign) > 0
    ORDER BY sessions DESC
    LIMIT ${sql.uint64(input.limit)}
  `;
}

export type TopGenericSeriesTopItemsInput = TopGenericQueryInput;

export function topGenericSeriesTopItemsQuery(
  input: TopGenericSeriesTopItemsInput
): SqlFragment {
  return topGenericQuery(input);
}

export interface TopGenericSeriesTimeSeriesInput {
  projectId: string;
  startDate: string;
  endDate: string;
  interval: IInterval;
  column: string;
  prefixColumn: string | null;
  /** Always applied — unlike the top-items query, V1 applies this unconditionally. */
  rawFilterWhere: SqlFragment | null;
  /** Additionally applied on top of `rawFilterWhere` when the caller has a page filter. */
  distinctSessionsCte: SqlFragment | null;
}

export function topGenericSeriesTimeSeriesQuery(
  input: TopGenericSeriesTimeSeriesInput
): SqlFragment {
  const groupBy = topGenericGroupBy(input.column, input.prefixColumn);
  return sql`
    ${distinctSessionsCteHeader(input.distinctSessionsCte)}
    SELECT
      ${toStartOf('created_at', input.interval)} AS date,
      ${topGenericSelect(input.column, input.prefixColumn)}
    FROM sessions
    WHERE project_id = ${sql.string(input.projectId)}
      AND ${dateRangeWhere('created_at', input.startDate, input.endDate)}
      ${rawWhere(input.rawFilterWhere)}
      ${distinctSessionsConstraint(input.distinctSessionsCte)}
    GROUP BY date, ${groupBy}
    HAVING sum(sign) > 0
    ORDER BY date ASC
    ${fillClause(input.interval, input.startDate, input.endDate)}
  `;
}

// --- user journey (sankey of screen_view paths) ----------------------------------

export interface OrderedEventsQueryInput {
  projectId: string;
  startDate: string;
  endDate: string;
  rawFilterWhere: SqlFragment | null;
}

function orderedEventsQuery(input: OrderedEventsQueryInput): SqlFragment {
  return sql`
    SELECT session_id, concat(origin, path) as path, created_at
    FROM events
    WHERE project_id = ${sql.string(input.projectId)}
      AND name = 'screen_view'
      AND path != ''
      AND path IS NOT NULL
      AND ${dateRangeWhere('created_at', input.startDate, input.endDate)}
      ${rawWhere(input.rawFilterWhere)}
    ORDER BY session_id ASC, created_at ASC
  `;
}

/**
 * `arrayCompact` drops consecutive repeats in linear time. V1's `arrayFilter`
 * spelling was Theta(n^2) in the longest session's pageview count and could not
 * answer for a tenant with one very long session — the same defect, and the same
 * fix, as sankey.sql.ts's DEDUPE_CONSECUTIVE.
 */
function pathsDedupedCte(
  input: OrderedEventsQueryInput,
  steps: number
): SqlFragment {
  return sql`
    WITH ordered_events AS (${orderedEventsQuery(input)})
    SELECT
      session_id,
      arraySlice(
        arrayCompact(groupArray(path)),
        1, ${sql.uint64(steps)}
      ) as paths_deduped
    FROM ordered_events
    GROUP BY session_id
  `;
}

/** The "truncate at first repeat" expression, reused by the entries and transitions queries. */
const TRUNCATED_PATHS = sql`
  if(
    arrayFirstIndex(x -> x > 1, arrayEnumerateUniq(paths_deduped)) = 0,
    paths_deduped,
    arraySlice(
      paths_deduped,
      1,
      arrayFirstIndex(x -> x > 1, arrayEnumerateUniq(paths_deduped)) - 1
    )
  )
`;

export interface TopEntriesQueryInput extends OrderedEventsQueryInput {
  steps: number;
  topEntries: number;
}

export function topEntriesQuery(input: TopEntriesQueryInput): SqlFragment {
  const sessionPaths = sql`
    WITH paths_deduped_cte AS (${pathsDedupedCte(input, input.steps)})
    SELECT
      session_id,
      ${TRUNCATED_PATHS} as paths,
      paths[1] as entry_page
    FROM paths_deduped_cte
    HAVING length(paths) >= 2
  `;
  return sql`
    WITH session_paths AS (${sessionPaths})
    SELECT entry_page, count() as count
    FROM session_paths
    GROUP BY entry_page
    ORDER BY count DESC
    LIMIT ${sql.uint64(input.topEntries)}
  `;
}

export interface TransitionsQueryInput extends OrderedEventsQueryInput {
  steps: number;
  topEntryPages: string[];
}

export function transitionsQuery(input: TransitionsQueryInput): SqlFragment {
  const sessionPaths = sql`
    SELECT ${TRUNCATED_PATHS} as paths
    FROM paths_deduped_cte
    HAVING length(paths) >= 2
      AND paths[1] IN ${sql.array('String', input.topEntryPages)}
  `;
  return sql`
    WITH
      paths_deduped_cte AS (${pathsDedupedCte(input, input.steps)}),
      session_paths AS (${sessionPaths})
    SELECT pair.1 as source, pair.2 as target, pair.3 as step, count() as value
    FROM (
      SELECT arrayJoin(arrayMap(i -> (paths[i], paths[i + 1], i), range(1, length(paths)))) as pair
      FROM session_paths
      WHERE length(paths) >= 2
    )
    GROUP BY source, target, step
    ORDER BY step ASC, value DESC
  `;
}

// --- top events ------------------------------------------------------------------

export interface TopEventsQueryInput {
  projectId: string;
  startDate: string;
  endDate: string;
  rawFilterWhere: SqlFragment | null;
  excludeEvents: string[];
}

export function topEventsQuery(input: TopEventsQueryInput): SqlFragment {
  const exclude =
    input.excludeEvents.length > 0
      ? sql`AND name NOT IN ${sql.array('String', input.excludeEvents)}`
      : sql.empty;
  return sql`
    SELECT name, count() as count
    FROM events
    WHERE project_id = ${sql.string(input.projectId)}
      AND ${dateRangeWhere('created_at', input.startDate, input.endDate)}
      ${rawWhere(input.rawFilterWhere)}
      ${exclude}
    GROUP BY name
    ORDER BY count DESC
    LIMIT 1000
  `;
}

// --- top link-out ------------------------------------------------------------------

export interface TopLinkOutQueryInput {
  projectId: string;
  startDate: string;
  endDate: string;
  rawFilterWhere: SqlFragment | null;
}

export function topLinkOutQuery(input: TopLinkOutQueryInput): SqlFragment {
  const hrefKey = getSelectPropertyKey('properties.href');
  return sql`
    SELECT ${hrefKey} as href, count() as count
    FROM events
    WHERE project_id = ${sql.string(input.projectId)}
      AND name = 'link_out'
      AND ${dateRangeWhere('created_at', input.startDate, input.endDate)}
      ${rawWhere(input.rawFilterWhere)}
      AND ${hrefKey} IS NOT NULL AND ${hrefKey} != ''
    GROUP BY href
    ORDER BY count DESC
    LIMIT 1000
  `;
}

// --- map data ------------------------------------------------------------------

export interface MapDataQueryInput {
  projectId: string;
  startDate: string;
  endDate: string;
  rawFilterWhere: SqlFragment | null;
}

export function mapDataQuery(input: MapDataQueryInput): SqlFragment {
  return sql`
    SELECT
      nullIf(country, '') as country,
      nullIf(region, '') as region,
      nullIf(city, '') as city,
      uniq(session_id) as count
    FROM events
    WHERE project_id = ${sql.string(input.projectId)}
      AND ${dateRangeWhere('created_at', input.startDate, input.endDate)}
      ${rawWhere(input.rawFilterWhere)}
      AND country IS NOT NULL AND country != ''
    GROUP BY country, region, city
    ORDER BY count DESC
    LIMIT 1000
  `;
}

// --- live data (dashboard's 30-minute rolling window) ---------------------------

export interface LiveTotalSessionsQueryInput {
  projectId: string;
}

export function liveTotalSessionsQuery(
  input: LiveTotalSessionsQueryInput
): SqlFragment {
  return sql`
    SELECT uniq(session_id) as total_sessions
    FROM events
    WHERE project_id = ${sql.string(input.projectId)}
      AND created_at >= now() - INTERVAL 30 MINUTE
  `;
}

export function liveMinuteCountsQuery(
  input: LiveTotalSessionsQueryInput
): SqlFragment {
  return sql`
    SELECT
      toStartOfMinute(created_at) as minute,
      uniq(session_id) as session_count,
      uniq(profile_id) as visitor_count
    FROM events
    WHERE project_id = ${sql.string(input.projectId)}
      AND created_at >= now() - INTERVAL 30 MINUTE
    GROUP BY minute
    ORDER BY minute ASC
    WITH FILL FROM toStartOfMinute(now() - INTERVAL 30 MINUTE) TO toStartOfMinute(now()) STEP INTERVAL 1 MINUTE
  `;
}

export function liveMinuteReferrersQuery(
  input: LiveTotalSessionsQueryInput
): SqlFragment {
  return sql`
    SELECT
      toStartOfMinute(created_at) as minute,
      referrer_name,
      uniq(session_id) as count
    FROM events
    WHERE project_id = ${sql.string(input.projectId)}
      AND created_at >= now() - INTERVAL 30 MINUTE
      AND referrer_name != ''
      AND referrer_name IS NOT NULL
    GROUP BY minute, referrer_name
    ORDER BY minute ASC, count DESC
  `;
}

export function liveReferrersQuery(
  input: LiveTotalSessionsQueryInput
): SqlFragment {
  return sql`
    SELECT referrer_name as referrer, uniq(session_id) as count
    FROM events
    WHERE project_id = ${sql.string(input.projectId)}
      AND created_at >= now() - INTERVAL 30 MINUTE
      AND referrer_name != ''
      AND referrer_name IS NOT NULL
    GROUP BY referrer_name
    ORDER BY count DESC
    LIMIT 10
  `;
}
