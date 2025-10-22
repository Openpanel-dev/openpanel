import { average, sum } from '@openpanel/common';
import { getCache } from '@openpanel/redis';
import { type IChartEventFilter, zTimeInterval } from '@openpanel/validation';
import { omit } from 'ramda';
import sqlstring from 'sqlstring';
import { z } from 'zod';
import {
  TABLE_NAMES,
  ch,
  chQuery,
  formatClickhouseDate,
} from '../clickhouse/client';
import { getEventFiltersWhereClause } from './chart.service';

export const zGetMetricsInput = z.object({
  projectId: z.string(),
  filters: z.array(z.any()),
  startDate: z.string(),
  endDate: z.string(),
  interval: zTimeInterval,
});

export type IGetMetricsInput = z.infer<typeof zGetMetricsInput> & {
  timezone: string;
};

export const zGetTopPagesInput = z.object({
  projectId: z.string(),
  filters: z.array(z.any()),
  startDate: z.string(),
  endDate: z.string(),
  cursor: z.number().optional(),
  limit: z.number().optional(),
});

export type IGetTopPagesInput = z.infer<typeof zGetTopPagesInput> & {
  timezone: string;
};

export const zGetTopEntryExitInput = z.object({
  projectId: z.string(),
  filters: z.array(z.any()),
  startDate: z.string(),
  endDate: z.string(),
  mode: z.enum(['entry', 'exit']),
  cursor: z.number().optional(),
  limit: z.number().optional(),
});

export type IGetTopEntryExitInput = z.infer<typeof zGetTopEntryExitInput> & {
  timezone: string;
};

export const zGetTopGenericInput = z.object({
  projectId: z.string(),
  filters: z.array(z.any()),
  startDate: z.string(),
  endDate: z.string(),
  column: z.enum([
    // Referrers
    'referrer',
    'referrer_name',
    'referrer_type',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    // Geo
    'region',
    'country',
    'city',
    // Device
    'device',
    'brand',
    'model',
    'browser',
    'browser_version',
    'os',
    'os_version',
  ]),
  cursor: z.number().optional(),
  limit: z.number().optional(),
});

export type IGetTopGenericInput = z.infer<typeof zGetTopGenericInput> & {
  timezone: string;
};

export class OverviewService {
  private pendingQueries: Map<string, Promise<number | null>> = new Map();

  constructor(private client: typeof ch) {}

  isPageFilter(filters: IChartEventFilter[]) {
    return filters.some((filter) => filter.name === 'path' && filter.value);
  }

  private toStartOfInterval(
    field: string,
    interval: string,
    timezone: string,
  ): string {
    const tzPart = timezone ? `, '${timezone}'` : '';
    switch (interval) {
      case 'hour':
        return `toStartOfHour(${field}${tzPart})`;
      case 'day':
        return `toStartOfDay(${field}${tzPart})`;
      case 'week':
        // toStartOfWeek(date, mode) - mode is UInt8, NOT timezone
        // mode 0 = Sunday, mode 1 = Monday
        // For timezone support, we need to convert to timezone first
        if (timezone) {
          return `toStartOfWeek(toTimeZone(${field}, '${timezone}'), 1)`;
        }
        return `toStartOfWeek(${field}, 1)`;
      case 'month':
        return `toStartOfMonth(${field}${tzPart})`;
      case 'year':
        return `toStartOfYear(${field}${tzPart})`;
      default:
        return `toStartOfDay(${field}${tzPart})`;
    }
  }

  private toInterval(value: string, interval: string): string {
    return `INTERVAL ${value} ${interval}`;
  }

  private buildWhereClause(
    type: 'events' | 'sessions',
    filters: IChartEventFilter[],
  ): string {
    const mappedFilters = filters.map((item) => {
      if (type === 'sessions') {
        if (item.name === 'path') {
          return { ...item, name: 'entry_path' };
        }
        if (item.name === 'origin') {
          return { ...item, name: 'entry_origin' };
        }
        if (item.name.startsWith('properties.__query.utm_')) {
          return {
            ...item,
            name: item.name.replace('properties.__query.utm_', 'utm_'),
          };
        }
      }
      return item;
    });

    const where = getEventFiltersWhereClause(mappedFilters);
    return Object.values(where).filter(Boolean).join(' AND ');
  }

  /**
   * Get overview metrics and time series.
   *
   * Performance optimization (following Plausible's approach):
   * - WITHOUT page filters: Query sessions table directly (much faster!)
   * - WITH page filters: Query events table and join with sessions for bounce rate
   *
   * This optimization significantly improves performance because:
   * 1. Sessions table is much smaller than events table
   * 2. Sessions table already has pre-aggregated data (screen_view_count, duration, etc.)
   * 3. When filtering by page, we must hit events table anyway to match specific pages
   */
  async getMetrics({
    projectId,
    filters,
    startDate,
    endDate,
    interval,
    timezone,
  }: IGetMetricsInput): Promise<{
    metrics: {
      bounce_rate: number;
      unique_visitors: number;
      total_sessions: number;
      avg_session_duration: number;
      total_screen_views: number;
      views_per_session: number;
    };
    series: {
      date: string;
      bounce_rate: number;
      unique_visitors: number;
      total_sessions: number;
      avg_session_duration: number;
      total_screen_views: number;
      views_per_session: number;
    }[];
  }> {
    const hasPageFilter = this.isPageFilter(filters);
    const startOfInterval = this.toStartOfInterval(
      'created_at',
      interval,
      timezone,
    );

    // Following Plausible: Use a lookback window for sessions
    // Sessions can start before the period but have events within it
    const sessionLookbackDays = 7;
    const sessionLookbackStart = new Date(startDate);
    sessionLookbackStart.setDate(
      sessionLookbackStart.getDate() - sessionLookbackDays,
    );

    if (hasPageFilter) {
      // WITH PAGE FILTER: use events table, join sessions for bounce rate
      const eventsWhere = this.buildWhereClause('events', filters);
      const sessionsWhere = this.buildWhereClause('sessions', filters);

      const sql = `
        WITH 
          -- Sessions that visited the filtered pages
          filtered_sessions AS (
            SELECT DISTINCT
              ${startOfInterval} AS date,
              session_id,
              profile_id
            FROM ${TABLE_NAMES.events}
            WHERE project_id = ${sqlstring.escape(projectId)}
              AND created_at BETWEEN toDateTime(${sqlstring.escape(formatClickhouseDate(startDate))}) 
                                 AND toDateTime(${sqlstring.escape(formatClickhouseDate(endDate))})
              AND name = 'screen_view'
              ${eventsWhere ? `AND ${eventsWhere}` : ''}
          ),
          -- Get session stats for filtered sessions
          session_stats AS (
            SELECT 
              ${startOfInterval} AS date,
              round(avgIf(duration, duration > 0 AND sign > 0) / 1000, 2) AS avg_session_duration
            FROM ${TABLE_NAMES.sessions} s
            INNER JOIN filtered_sessions fs ON s.id = fs.session_id
            WHERE s.project_id = ${sqlstring.escape(projectId)}
              AND s.created_at BETWEEN toDateTime(${sqlstring.escape(formatClickhouseDate(startDate))}) 
                                   AND toDateTime(${sqlstring.escape(formatClickhouseDate(endDate))})
              AND sign = 1
            GROUP BY date
            WITH ROLLUP
          ),
          -- Bounce rate calculated separately with entry_path filter
          bounce_stats AS (
            SELECT 
              ${startOfInterval} AS date,
              round(
                countIf(is_bounce = 1 AND sign = 1) * 100.0 
                / nullIf(countIf(sign = 1), 0), 
                2
              ) AS bounce_rate
            FROM ${TABLE_NAMES.sessions} s
            WHERE s.project_id = ${sqlstring.escape(projectId)}
              AND s.created_at BETWEEN toDateTime(${sqlstring.escape(formatClickhouseDate(startDate))}) 
                                   AND toDateTime(${sqlstring.escape(formatClickhouseDate(endDate))})
              AND sign = 1
              ${sessionsWhere ? `AND ${sessionsWhere}` : ''}
            GROUP BY date
            WITH ROLLUP
          )
        SELECT
          ${startOfInterval} AS date,
          any(ss.bounce_rate) AS bounce_rate,
          uniq(e.profile_id) AS unique_visitors,
          uniq(e.session_id) AS total_sessions,
          any(ss.avg_session_duration) AS avg_session_duration,
          count(*) AS total_screen_views,
          round(count(*) * 1.0 / nullIf(uniq(e.session_id), 0), 2) AS views_per_session
        FROM ${TABLE_NAMES.events} e
        LEFT JOIN session_stats ss ON ${startOfInterval} = ss.date
        WHERE e.project_id = ${sqlstring.escape(projectId)}
          AND e.created_at BETWEEN toDateTime(${sqlstring.escape(formatClickhouseDate(startDate))}) 
                               AND toDateTime(${sqlstring.escape(formatClickhouseDate(endDate))})
          AND e.name = 'screen_view'
          ${eventsWhere ? `AND ${eventsWhere}` : ''}
        GROUP BY date
        WITH ROLLUP
        ORDER BY date ASC WITH FILL
          FROM ${this.toStartOfInterval(
            `toDateTime(${sqlstring.escape(formatClickhouseDate(startDate))})`,
            interval,
            timezone,
          )}
          TO ${this.toStartOfInterval(
            `toDateTime(${sqlstring.escape(formatClickhouseDate(endDate))})`,
            interval,
            timezone,
          )}
          STEP ${this.toInterval('1', interval)}
      `;

      const res = await chQuery<{
        date: string;
        bounce_rate: number;
        unique_visitors: number;
        total_sessions: number;
        avg_session_duration: number;
        total_screen_views: number;
        views_per_session: number;
      }>(sql);

      // WITH ROLLUP: First row is the aggregated totals, rest are time series
      const rollupRow = res[0];
      const series = res.slice(1).map((r) => ({
        ...r,
        date: new Date(r.date).toISOString(),
      }));

      return {
        metrics: {
          bounce_rate: rollupRow?.bounce_rate ?? 0,
          unique_visitors: rollupRow?.unique_visitors ?? 0,
          total_sessions: rollupRow?.total_sessions ?? 0,
          avg_session_duration: rollupRow?.avg_session_duration ?? 0,
          total_screen_views: rollupRow?.total_screen_views ?? 0,
          views_per_session: rollupRow?.views_per_session ?? 0,
        },
        series: series.map((s) => ({
          ...s,
          bounce_rate: s.bounce_rate ?? 0,
        })),
      };
    }

    // WITHOUT PAGE FILTER: use sessions table directly (much faster!)
    // All data is pre-aggregated in sessions table, no need to touch events table
    const sessionsWhere = this.buildWhereClause('sessions', filters);

    const sql = `
      SELECT
        ${startOfInterval} AS date,
        round(
          sumIf(is_bounce * sign, sign = 1) * 100.0 
          / nullIf(sumIf(sign, sign = 1), 0), 
          2
        ) AS bounce_rate,
        uniqIf(profile_id, sign > 0) AS unique_visitors,
        sumIf(sign, sign = 1) AS total_sessions,
        round(
          avgIf(duration, duration > 0 AND sign > 0) / 1000, 
          2
        ) AS avg_session_duration,
        sumIf(screen_view_count * sign, sign = 1) AS total_screen_views,
        round(
          sumIf(screen_view_count * sign, sign = 1) * 1.0 
          / nullIf(sumIf(sign, sign = 1), 0), 
          2
        ) AS views_per_session
      FROM ${TABLE_NAMES.sessions}
      WHERE project_id = ${sqlstring.escape(projectId)}
        -- Plausible pattern: 7-day lookback on session start for index optimization
        AND created_at >= toDateTime(${sqlstring.escape(formatClickhouseDate(sessionLookbackStart))})
        AND ended_at >= toDateTime(${sqlstring.escape(formatClickhouseDate(startDate))})
        AND created_at <= toDateTime(${sqlstring.escape(formatClickhouseDate(endDate))})
        ${sessionsWhere ? `AND ${sessionsWhere}` : ''}
      GROUP BY date
      WITH ROLLUP
      HAVING sum(sign) > 0
      ORDER BY date ASC WITH FILL
        FROM ${this.toStartOfInterval(
          `toDateTime(${sqlstring.escape(formatClickhouseDate(startDate))})`,
          interval,
          timezone,
        )}
        TO ${this.toStartOfInterval(
          `toDateTime(${sqlstring.escape(formatClickhouseDate(endDate))})`,
          interval,
          timezone,
        )}
        STEP ${this.toInterval('1', interval)}
    `;

    const res = await chQuery<{
      date: string;
      bounce_rate: number;
      unique_visitors: number;
      total_sessions: number;
      avg_session_duration: number;
      total_screen_views: number;
      views_per_session: number;
    }>(sql);

    // WITH ROLLUP: First row is the aggregated totals, rest are time series
    const rollupRow = res[0];
    const series = res.slice(1).map((r) => ({
      ...r,
      date: new Date(r.date).toISOString(),
    }));

    return {
      metrics: {
        bounce_rate: rollupRow?.bounce_rate ?? 0,
        unique_visitors: rollupRow?.unique_visitors ?? 0,
        total_sessions: rollupRow?.total_sessions ?? 0,
        avg_session_duration: rollupRow?.avg_session_duration ?? 0,
        total_screen_views: rollupRow?.total_screen_views ?? 0,
        views_per_session: rollupRow?.views_per_session ?? 0,
      },
      series,
    };
  }

  /**
   * Get top pages with bounce rates.
   *
   * Always queries events table for page-level metrics,
   * then joins with sessions table for bounce rates.
   */
  async getTopPages({
    projectId,
    filters,
    startDate,
    endDate,
    cursor = 1,
    limit = 10,
    timezone,
  }: IGetTopPagesInput) {
    const eventsWhere = this.buildWhereClause('events', filters);
    const sessionsWhere = this.buildWhereClause('sessions', filters);
    const offset = (cursor - 1) * limit;

    const sql = `
      WITH 
        -- Step 1: Calculate time spent on each page view (time to next event in session)
        page_view_durations AS (
          SELECT 
            origin,
            path,
            session_id,
            properties,
            dateDiff('millisecond', created_at, leadInFrame(toNullable(created_at), 1, NULL) OVER (PARTITION BY session_id ORDER BY created_at ASC ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING)) AS duration
          FROM ${TABLE_NAMES.events}
          WHERE project_id = ${sqlstring.escape(projectId)}
            AND created_at BETWEEN toDateTime(${sqlstring.escape(formatClickhouseDate(startDate))}) 
                               AND toDateTime(${sqlstring.escape(formatClickhouseDate(endDate))})
            AND name = 'screen_view'
            AND path != ''
            ${eventsWhere ? `AND ${eventsWhere}` : ''}
        ),
        -- Step 2: Group by page (origin + path) to get stats
        page_stats AS (
          SELECT 
            origin,
            path,
            anyLast(properties['__title']) AS title,
            uniq(session_id) AS count,
            round(avgIf(duration, duration > 0) / 1000, 2) AS avg_duration,
            countIf(duration > 0) AS duration_count
          FROM page_view_durations
          GROUP BY origin, path
          ORDER BY count DESC
          LIMIT ${limit} OFFSET ${offset}
        ),
        bounce_stats AS (
          SELECT 
            entry_path,
            entry_origin,
            COALESCE(round(countIf(is_bounce = 1 AND sign = 1) * 100.0 / countIf(sign = 1), 2), 0) AS bounce_rate
          FROM ${TABLE_NAMES.sessions}
          WHERE project_id = ${sqlstring.escape(projectId)}
            AND created_at BETWEEN toDateTime(${sqlstring.escape(formatClickhouseDate(startDate))}) 
                               AND toDateTime(${sqlstring.escape(formatClickhouseDate(endDate))})
            AND sign = 1
            ${sessionsWhere ? `AND ${sessionsWhere}` : ''}
          GROUP BY entry_path, entry_origin
        )
      SELECT 
        p.title,
        p.origin,
        p.path,
        p.avg_duration,
        p.count AS sessions,
        COALESCE(b.bounce_rate, 0) AS bounce_rate
      FROM page_stats p
      LEFT JOIN bounce_stats b ON p.path = b.entry_path AND p.origin = b.entry_origin
      ORDER BY sessions DESC
    `;

    console.log('sql', sql);

    return chQuery<{
      title: string;
      origin: string;
      path: string;
      avg_duration: number;
      bounce_rate: number;
      sessions: number;
    }>(sql);
  }

  /**
   * Get top entry/exit pages.
   *
   * Optimization:
   * - WITHOUT page filters: Query sessions table directly
   * - WITH page filters: Join with events to filter sessions
   */
  async getTopEntryExit({
    projectId,
    filters,
    startDate,
    endDate,
    mode,
    cursor = 1,
    limit = 10,
    timezone,
  }: IGetTopEntryExitInput) {
    const hasPageFilter = this.isPageFilter(filters);
    const sessionsWhere = this.buildWhereClause('sessions', filters);
    const offset = (cursor - 1) * limit;

    if (hasPageFilter) {
      // WITH PAGE FILTER: restrict to sessions that have matching events
      const eventsWhere = this.buildWhereClause('events', filters);

      const sql = `
        WITH distinct_sessions AS (
          SELECT DISTINCT session_id
          FROM ${TABLE_NAMES.events}
          WHERE project_id = ${sqlstring.escape(projectId)}
            AND created_at BETWEEN toDateTime(${sqlstring.escape(formatClickhouseDate(startDate))}) 
                               AND toDateTime(${sqlstring.escape(formatClickhouseDate(endDate))})
            ${eventsWhere ? `AND ${eventsWhere}` : ''}
        )
        SELECT
          ${mode}_origin AS origin,
          ${mode}_path AS path,
          round(avg(duration * sign) / 1000, 2) AS avg_duration,
          round(sum(sign * is_bounce) * 100.0 / sum(sign), 2) AS bounce_rate,
          sum(sign) AS sessions
        FROM ${TABLE_NAMES.sessions}
        WHERE project_id = ${sqlstring.escape(projectId)}
          AND created_at BETWEEN toDateTime(${sqlstring.escape(formatClickhouseDate(startDate))}) 
                             AND toDateTime(${sqlstring.escape(formatClickhouseDate(endDate))})
          AND id IN (SELECT session_id FROM distinct_sessions)
          ${sessionsWhere ? `AND ${sessionsWhere}` : ''}
        GROUP BY ${mode}_origin, ${mode}_path
        HAVING sum(sign) > 0
        ORDER BY sessions DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      return chQuery<{
        origin: string;
        path: string;
        avg_duration: number;
        bounce_rate: number;
        sessions: number;
      }>(sql);
    }

    // WITHOUT PAGE FILTER: direct query on sessions table
    const sql = `
      SELECT
        ${mode}_origin AS origin,
        ${mode}_path AS path,
        round(avg(duration * sign) / 1000, 2) AS avg_duration,
        round(sum(sign * is_bounce) * 100.0 / sum(sign), 2) AS bounce_rate,
        sum(sign) AS sessions
      FROM ${TABLE_NAMES.sessions}
      WHERE project_id = ${sqlstring.escape(projectId)}
        AND created_at BETWEEN toDateTime(${sqlstring.escape(formatClickhouseDate(startDate))}) 
                           AND toDateTime(${sqlstring.escape(formatClickhouseDate(endDate))})
        ${sessionsWhere ? `AND ${sessionsWhere}` : ''}
      GROUP BY ${mode}_origin, ${mode}_path
      HAVING sum(sign) > 0
      ORDER BY sessions DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return chQuery<{
      origin: string;
      path: string;
      avg_duration: number;
      bounce_rate: number;
      sessions: number;
    }>(sql);
  }

  /**
   * Get top generic dimensions (referrers, geo, devices, etc).
   *
   * Optimization:
   * - WITHOUT page filters: Query sessions table directly
   * - WITH page filters: Join with events to filter sessions
   */
  async getTopGeneric({
    projectId,
    filters,
    startDate,
    endDate,
    column,
    cursor = 1,
    limit = 10,
    timezone,
  }: IGetTopGenericInput) {
    const hasPageFilter = this.isPageFilter(filters);
    const sessionsWhere = this.buildWhereClause('sessions', filters);
    const offset = (cursor - 1) * limit;

    const prefixColumn = (() => {
      switch (column) {
        case 'region':
          return 'country';
        case 'city':
          return 'country';
        case 'browser_version':
          return 'browser';
        case 'os_version':
          return 'os';
      }
      return null;
    })();

    const selectPrefix = prefixColumn ? `${prefixColumn} AS prefix,` : '';
    const groupByPrefix = prefixColumn ? `${prefixColumn},` : '';

    if (hasPageFilter) {
      // WITH PAGE FILTER: restrict to sessions that have matching events
      const eventsWhere = this.buildWhereClause('events', filters);

      const sql = `
        WITH distinct_sessions AS (
          SELECT DISTINCT session_id
          FROM ${TABLE_NAMES.events}
          WHERE project_id = ${sqlstring.escape(projectId)}
            AND created_at BETWEEN toDateTime(${sqlstring.escape(formatClickhouseDate(startDate))}) 
                               AND toDateTime(${sqlstring.escape(formatClickhouseDate(endDate))})
            ${eventsWhere ? `AND ${eventsWhere}` : ''}
        )
        SELECT
          ${selectPrefix}
          nullIf(${column}, '') AS name,
          sum(sign) AS sessions,
          round(sum(sign * is_bounce) * 100.0 / sum(sign), 2) AS bounce_rate,
          round(avgIf(duration, duration > 0 AND sign > 0) / 1000, 2) AS avg_session_duration
        FROM ${TABLE_NAMES.sessions}
        WHERE project_id = ${sqlstring.escape(projectId)}
          AND created_at BETWEEN toDateTime(${sqlstring.escape(formatClickhouseDate(startDate))}) 
                             AND toDateTime(${sqlstring.escape(formatClickhouseDate(endDate))})
          AND id IN (SELECT session_id FROM distinct_sessions)
          ${sessionsWhere ? `AND ${sessionsWhere}` : ''}
        GROUP BY ${groupByPrefix} ${column}
        HAVING sum(sign) > 0
        ORDER BY sessions DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      return chQuery<{
        prefix?: string;
        name: string;
        sessions: number;
        bounce_rate: number;
        avg_session_duration: number;
      }>(sql);
    }

    // WITHOUT PAGE FILTER: direct query on sessions table
    const sql = `
      SELECT
        ${selectPrefix}
        nullIf(${column}, '') AS name,
        sum(sign) AS sessions,
        round(sum(sign * is_bounce) * 100.0 / sum(sign), 2) AS bounce_rate,
        round(avgIf(duration, duration > 0 AND sign > 0) / 1000, 2) AS avg_session_duration
      FROM ${TABLE_NAMES.sessions}
      WHERE project_id = ${sqlstring.escape(projectId)}
        AND created_at BETWEEN toDateTime(${sqlstring.escape(formatClickhouseDate(startDate))}) 
                           AND toDateTime(${sqlstring.escape(formatClickhouseDate(endDate))})
        ${sessionsWhere ? `AND ${sessionsWhere}` : ''}
      GROUP BY ${groupByPrefix} ${column}
      HAVING sum(sign) > 0
      ORDER BY sessions DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return chQuery<{
      prefix?: string;
      name: string;
      sessions: number;
      bounce_rate: number;
      avg_session_duration: number;
    }>(sql);
  }
}

export const overviewService = new OverviewService(ch);
