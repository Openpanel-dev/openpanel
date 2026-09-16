// Every ClickHouse query PagesService/getPageConversionsCore runs, as pure
// `sql` fragments (ADR-013). Converted 1:1 from
// packages/db/src/services/pages.service.ts: the SQL text is V1's, with every
// value bound as a `{pN:Type}` parameter instead of clix's inline
// interpolation or (for `getPageConversionsCore`) `sqlstring.escape`. Result
// sets diffed against V1's on the local prod-copy — see pages.sql.proof.md.

import { type SqlFragment, sql } from '@openpanel/db/src/clickhouse/sql';
import type { IInterval } from '../../report/report.constants';
import { fillClause, toStartOf } from './overview.sql';

function toDateTimeLiteral(value: string): string {
  return new Date(value).toISOString().slice(0, 19).replace('T', ' ');
}

function dateRangeWhere(
  column: string,
  startDate: string,
  endDate: string
): SqlFragment {
  return sql`${sql.id(column)} BETWEEN toDateTime(${sql.string(toDateTimeLiteral(startDate))}) AND toDateTime(${sql.string(toDateTimeLiteral(endDate))})`;
}

export interface TopPagesQueryInput {
  projectId: string;
  startDate: string;
  endDate: string;
  search?: string;
  limit?: number;
}

function searchClause(search: string | undefined): SqlFragment {
  if (!search) {
    return sql.empty;
  }
  const term = sql.string(`%${search}%`);
  return sql`AND (e.path LIKE ${term} OR e.origin LIKE ${term} OR pt.title LIKE ${term})`;
}

export function topPagesQuery(input: TopPagesQueryInput): SqlFragment {
  const titlesCte = sql`
    SELECT concat(origin, path) as page_key, anyLast(properties['__title']) as title
    FROM events
    WHERE project_id = ${sql.string(input.projectId)}
      AND name = 'screen_view'
      AND created_at >= now() - INTERVAL 30 DAY
    GROUP BY origin, path
  `;

  const screenViewDurationsCte = sql`
    SELECT
      project_id,
      session_id,
      path,
      origin,
      dateDiff('millisecond', created_at, lead(created_at, 1, created_at) OVER (PARTITION BY session_id ORDER BY created_at)) AS duration
    FROM events
    WHERE project_id = ${sql.string(input.projectId)}
      AND name = 'screen_view'
      AND path != ''
      AND ${dateRangeWhere('created_at', input.startDate, input.endDate)}
  `;

  const sessionsSubquery = sql`
    SELECT id, project_id, is_bounce
    FROM sessions FINAL
    WHERE project_id = ${sql.string(input.projectId)}
      AND ${dateRangeWhere('created_at', input.startDate, input.endDate)}
      AND sign = 1
  `;

  const limitClause =
    input.limit === undefined
      ? sql.empty
      : sql`LIMIT ${sql.uint64(input.limit)}`;

  return sql`
    WITH
      page_titles AS (${titlesCte}),
      screen_view_durations AS (${screenViewDurationsCte})
    SELECT
      e.origin as origin,
      e.path as path,
      coalesce(pt.title, '') as title,
      uniq(e.session_id) as sessions,
      count() as pageviews,
      round(avg(e.duration) / 1000 / 60, 2) as avg_duration,
      round(
        (uniqIf(e.session_id, s.is_bounce = 1) * 100.0) /
        nullIf(uniq(e.session_id), 0),
        2
      ) as bounce_rate
    FROM screen_view_durations e
    LEFT JOIN (${sessionsSubquery}) s ON e.session_id = s.id AND e.project_id = s.project_id
    LEFT JOIN page_titles pt ON concat(e.origin, e.path) = pt.page_key
    WHERE 1
      ${searchClause(input.search)}
    GROUP BY e.origin, e.path, pt.title
    ORDER BY sessions DESC
    ${limitClause}
  `;
}

export interface PageTimeseriesQueryInput {
  projectId: string;
  startDate: string;
  endDate: string;
  interval: IInterval;
  filterOrigin?: string;
  filterPath?: string;
  /**
   * Keep only the `n` busiest pages in each date bucket. Omitted means
   * unbounded, which is one row per (origin, path, bucket) and on a project
   * with per-user URL segments is millions of rows — see pages.sql.proof.md.
   * `origin`/`path` break the ranking's ties so the truncated set is stable
   * between calls; without them ClickHouse returns a different top-n on every
   * run (measured, M31-002).
   */
  topPagesPerBucket?: number;
}

export function pageTimeseriesQuery(
  input: PageTimeseriesQueryInput
): SqlFragment {
  const originFilter = input.filterOrigin
    ? sql`AND e.origin = ${sql.string(input.filterOrigin)}`
    : sql.empty;
  const pathFilter = input.filterPath
    ? sql`AND e.path = ${sql.string(input.filterPath)}`
    : sql.empty;

  // `WITH FILL` attaches to the ORDER BY expression it follows, so the
  // ranking columns go after it, not before. ClickHouse fills AFTER
  // `LIMIT BY` (EXPLAIN PLAN: Filling > LimitBy), so empty buckets are still
  // filled and never spend the bucket's quota.
  const bucketRanking =
    input.topPagesPerBucket === undefined
      ? sql.empty
      : sql`, pageviews DESC, origin ASC, path ASC`;
  const bucketLimit =
    input.topPagesPerBucket === undefined
      ? sql.empty
      : sql`LIMIT ${sql.uint64(input.topPagesPerBucket)} BY date`;

  return sql`
    SELECT
      e.origin as origin,
      e.path as path,
      ${toStartOf('e.created_at', input.interval)} AS date,
      count() as pageviews,
      uniq(e.session_id) as sessions
    FROM events e
    WHERE e.project_id = ${sql.string(input.projectId)}
      AND e.name = 'screen_view'
      AND e.path != ''
      AND ${dateRangeWhere('e.created_at', input.startDate, input.endDate)}
      ${originFilter}
      ${pathFilter}
    GROUP BY e.origin, e.path, date
    ORDER BY date ASC
    ${fillClause(input.interval, input.startDate, input.endDate)}${bucketRanking}
    ${bucketLimit}
  `;
}

export interface PageConversionsQueryInput {
  projectId: string;
  startDate: string;
  endDate: string;
  conversionEvent: string;
  windowHours: number;
  limit: number;
}

export function pageConversionsQuery(
  input: PageConversionsQueryInput
): SqlFragment {
  const conversionEvents = sql`
    SELECT profile_id, created_at AS conv_time
    FROM events
    WHERE project_id = ${sql.string(input.projectId)}
      AND name = ${sql.string(input.conversionEvent)}
      AND ${dateRangeWhere('created_at', input.startDate, input.endDate)}
  `;

  const viewsBeforeConversions = sql`
    SELECT DISTINCT e.profile_id, e.path, e.origin
    FROM events AS e
    INNER JOIN conversion_events AS c ON e.profile_id = c.profile_id
    WHERE e.project_id = ${sql.string(input.projectId)}
      AND e.name = 'screen_view'
      AND e.path != ''
      AND ${dateRangeWhere('e.created_at', input.startDate, input.endDate)}
      AND e.created_at < c.conv_time
      AND e.created_at >= c.conv_time - INTERVAL ${sql.uint64(input.windowHours)} HOUR
  `;

  const totalVisitors = sql`
    SELECT path, origin, uniq(session_id) AS visitors
    FROM events
    WHERE project_id = ${sql.string(input.projectId)}
      AND name = 'screen_view'
      AND path != ''
      AND ${dateRangeWhere('created_at', input.startDate, input.endDate)}
    GROUP BY path, origin
  `;

  return sql`
    WITH
      conversion_events AS (${conversionEvents}),
      views_before_conversions AS (${viewsBeforeConversions}),
      total_visitors AS (${totalVisitors})
    SELECT
      vbc.path,
      vbc.origin,
      count() AS unique_converters,
      any(tv.visitors) AS total_visitors,
      round(100.0 * count() / any(tv.visitors), 2) AS conversion_rate
    FROM views_before_conversions AS vbc
    LEFT JOIN total_visitors AS tv ON vbc.path = tv.path AND vbc.origin = tv.origin
    GROUP BY vbc.path, vbc.origin
    ORDER BY unique_converters DESC
    LIMIT ${sql.uint64(input.limit)}
  `;
}
