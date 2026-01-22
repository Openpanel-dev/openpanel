import { average, sum } from '@openpanel/common';
import { chartColors } from '@openpanel/constants';
import { getCache } from '@openpanel/redis';
import { type IChartEventFilter, zTimeInterval } from '@openpanel/validation';
import { omit } from 'ramda';
import { z } from 'zod';
import { TABLE_NAMES, ch } from '../clickhouse/client';
import { clix } from '../clickhouse/query-builder';
import { getEventFiltersWhereClause } from './chart.service';

// Constants
const ROLLUP_DATE_PREFIX = '1970-01-01';

// Toggle revenue tracking in overview queries
const INCLUDE_REVENUE = true; // TODO: Make this configurable later

// Maximum number of records to return (for detail modals)
const MAX_RECORDS_LIMIT = 1000;

const COLUMN_PREFIX_MAP: Record<string, string> = {
  region: 'country',
  city: 'country',
  browser_version: 'browser',
  os_version: 'os',
};

// Types
type MetricsRow = {
  bounce_rate: number;
  unique_visitors: number;
  total_sessions: number;
  avg_session_duration: number;
  total_screen_views: number;
  views_per_session: number;
};

type MetricsSeriesRow = MetricsRow & { date: string; total_revenue: number };

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
});

export type IGetTopGenericInput = z.infer<typeof zGetTopGenericInput> & {
  timezone: string;
};

export const zGetTopGenericSeriesInput = zGetTopGenericInput.extend({
  interval: zTimeInterval,
});

export type IGetTopGenericSeriesInput = z.infer<
  typeof zGetTopGenericSeriesInput
> & {
  timezone: string;
};

export const zGetUserJourneyInput = z.object({
  projectId: z.string(),
  filters: z.array(z.any()),
  startDate: z.string(),
  endDate: z.string(),
  steps: z.number().min(2).max(10).default(5),
});

export type IGetUserJourneyInput = z.infer<typeof zGetUserJourneyInput> & {
  timezone: string;
};

export class OverviewService {
  constructor(private client: typeof ch) {}

  // Helper methods
  private isRollupRow(date: string): boolean {
    return date.startsWith(ROLLUP_DATE_PREFIX);
  }

  private getFillConfig(interval: string, startDate: string, endDate: string) {
    const useDateOnly = ['month', 'week'].includes(interval);
    return {
      from: clix.toStartOf(
        clix.datetime(startDate, useDateOnly ? 'toDate' : 'toDateTime'),
        interval as any,
      ),
      to: clix.datetime(endDate, useDateOnly ? 'toDate' : 'toDateTime'),
      step: clix.toInterval('1', interval as any),
    };
  }

  private createRevenueQuery({
    projectId,
    startDate,
    endDate,
    interval,
    timezone,
    filters,
  }: {
    projectId: string;
    startDate: string;
    endDate: string;
    interval: string;
    timezone: string;
    filters: IChartEventFilter[];
  }) {
    return clix(this.client, timezone)
      .select<{ date: string; total_revenue: number }>([
        `${clix.toStartOf('created_at', interval as any, timezone)} AS date`,
        'sum(revenue) AS total_revenue',
      ])
      .from(TABLE_NAMES.events)
      .where('project_id', '=', projectId)
      .where('name', '=', 'revenue')
      .where('revenue', '>', 0)
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate, 'toDateTime'),
        clix.datetime(endDate, 'toDateTime'),
      ])
      .rawWhere(this.getRawWhereClause('events', filters))
      .groupBy(['date'])
      .rollup()
      .transform({
        date: (item) => new Date(item.date).toISOString(),
      });
  }

  private mergeRevenueIntoSeries<T extends { date: string }>(
    series: T[],
    revenueData: { date: string; total_revenue: number }[],
  ): (T & { total_revenue: number })[] {
    const revenueByDate = new Map(
      revenueData
        .filter((r) => !this.isRollupRow(r.date))
        .map((r) => [r.date, r.total_revenue]),
    );
    return series.map((row) => ({
      ...row,
      total_revenue: revenueByDate.get(row.date) ?? 0,
    }));
  }

  private getOverallRevenue(
    revenueData: { date: string; total_revenue: number }[],
  ): number {
    return (
      revenueData.find((r) => this.isRollupRow(r.date))?.total_revenue ?? 0
    );
  }

  private withDistinctSessionsIfNeeded<T>(
    query: ReturnType<typeof clix>,
    params: {
      filters: IChartEventFilter[];
      projectId: string;
      startDate: string;
      endDate: string;
      timezone: string;
    },
  ): ReturnType<typeof clix> {
    if (!this.isPageFilter(params.filters)) {
      query.rawWhere(this.getRawWhereClause('sessions', params.filters));
      return query;
    }

    return clix(this.client, params.timezone)
      .with('distinct_sessions', this.getDistinctSessions(params))
      .merge(query)
      .where(
        'id',
        'IN',
        clix.exp('(SELECT session_id FROM distinct_sessions)'),
      );
  }

  isPageFilter(filters: IChartEventFilter[]) {
    return filters.some((filter) => filter.name === 'path' && filter.value);
  }

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
      total_revenue: number;
    };
    series: {
      date: string;
      bounce_rate: number;
      unique_visitors: number;
      total_sessions: number;
      avg_session_duration: number;
      total_screen_views: number;
      views_per_session: number;
      total_revenue: number;
    }[];
  }> {
    return this.isPageFilter(filters)
      ? this.getMetricsWithPageFilter({
          projectId,
          filters,
          startDate,
          endDate,
          interval,
          timezone,
        })
      : this.getMetricsFromSessions({
          projectId,
          filters,
          startDate,
          endDate,
          interval,
          timezone,
        });
  }

  private async getMetricsFromSessions({
    projectId,
    filters,
    startDate,
    endDate,
    interval,
    timezone,
  }: IGetMetricsInput): Promise<{
    metrics: MetricsRow & { total_revenue: number };
    series: MetricsSeriesRow[];
  }> {
    const where = this.getRawWhereClause('sessions', filters);
    const fillConfig = this.getFillConfig(interval, startDate, endDate);

    // Session metrics query
    const sessionQuery = clix(this.client, timezone)
      .select<{
        date: string;
        bounce_rate: number;
        unique_visitors: number;
        total_sessions: number;
        avg_session_duration: number;
        total_screen_views: number;
        views_per_session: number;
      }>([
        `${clix.toStartOf('created_at', interval as any, timezone)} AS date`,
        'round(sum(sign * is_bounce) * 100.0 / sum(sign), 2) as bounce_rate',
        'uniqIf(profile_id, sign > 0) AS unique_visitors',
        'sum(sign) AS total_sessions',
        'round(avgIf(duration, duration > 0 AND sign > 0), 2) / 1000 AS _avg_session_duration',
        'if(isNaN(_avg_session_duration), 0, _avg_session_duration) AS avg_session_duration',
        'sum(sign * screen_view_count) AS total_screen_views',
        'round(sum(sign * screen_view_count) * 1.0 / sum(sign), 2) AS views_per_session',
      ])
      .from('sessions')
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate, 'toDateTime'),
        clix.datetime(endDate, 'toDateTime'),
      ])
      .where('project_id', '=', projectId)
      .rawWhere(where)
      .groupBy(['date'])
      .having('sum(sign)', '>', 0)
      .rollup()
      .orderBy('date', 'ASC')
      .fill(fillConfig.from, fillConfig.to, fillConfig.step)
      .transform({
        date: (item) => new Date(item.date).toISOString(),
      });

    // Revenue query
    const revenueQuery = this.createRevenueQuery({
      projectId,
      startDate,
      endDate,
      interval,
      timezone,
      filters,
    });

    // Execute both queries in parallel and merge results
    const [sessionRes, revenueRes] = await Promise.all([
      sessionQuery.execute(),
      revenueQuery.execute(),
    ]);

    const overallRevenue = this.getOverallRevenue(revenueRes);
    const series = this.mergeRevenueIntoSeries(sessionRes.slice(1), revenueRes);

    return {
      metrics: {
        bounce_rate: sessionRes[0]?.bounce_rate ?? 0,
        unique_visitors: sessionRes[0]?.unique_visitors ?? 0,
        total_sessions: sessionRes[0]?.total_sessions ?? 0,
        avg_session_duration: sessionRes[0]?.avg_session_duration ?? 0,
        total_screen_views: sessionRes[0]?.total_screen_views ?? 0,
        views_per_session: sessionRes[0]?.views_per_session ?? 0,
        total_revenue: overallRevenue,
      },
      series,
    };
  }

  private async getMetricsWithPageFilter({
    projectId,
    filters,
    startDate,
    endDate,
    interval,
    timezone,
  }: IGetMetricsInput): Promise<{
    metrics: MetricsRow & { total_revenue: number };
    series: MetricsSeriesRow[];
  }> {
    const where = this.getRawWhereClause('sessions', filters);
    const fillConfig = this.getFillConfig(interval, startDate, endDate);

    // Session aggregation with bounce rates
    const sessionAggQuery = clix(this.client, timezone)
      .select([
        `${clix.toStartOf('created_at', interval as any, timezone)} AS date`,
        'round((countIf(is_bounce = 1 AND sign = 1) * 100.) / countIf(sign = 1), 2) AS bounce_rate',
      ])
      .from(TABLE_NAMES.sessions, true)
      .where('sign', '=', 1)
      .where('project_id', '=', projectId)
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate, 'toDateTime'),
        clix.datetime(endDate, 'toDateTime'),
      ])
      .rawWhere(where)
      .groupBy(['date'])
      .rollup()
      .orderBy('date', 'ASC');

    // Overall unique visitors
    const overallUniqueVisitorsQuery = clix(this.client, timezone)
      .select([
        'uniq(profile_id) AS unique_visitors',
        'uniq(session_id) AS total_sessions',
      ])
      .from(TABLE_NAMES.events)
      .where('project_id', '=', projectId)
      .where('name', '=', 'screen_view')
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate, 'toDateTime'),
        clix.datetime(endDate, 'toDateTime'),
      ])
      .rawWhere(this.getRawWhereClause('events', filters));

    // Use toDate for month/week intervals, toDateTime for others
    const rollupDate =
      interval === 'month' || interval === 'week'
        ? clix.date(ROLLUP_DATE_PREFIX)
        : clix.datetime(`${ROLLUP_DATE_PREFIX} 00:00:00`);

    // Main metrics query (without revenue)
    const mainQuery = clix(this.client, timezone)
      .with('session_agg', sessionAggQuery)
      .with(
        'overall_bounce_rate',
        clix(this.client, timezone)
          .select(['bounce_rate'])
          .from('session_agg')
          .where('date', '=', rollupDate),
      )
      .with(
        'daily_session_stats',
        clix(this.client, timezone)
          .select(['date', 'bounce_rate'])
          .from('session_agg')
          .where('date', '!=', rollupDate),
      )
      .with('overall_unique_visitors', overallUniqueVisitorsQuery)
      .select<{
        date: string;
        bounce_rate: number;
        unique_visitors: number;
        total_sessions: number;
        avg_session_duration: number;
        total_screen_views: number;
        views_per_session: number;
        overall_unique_visitors: number;
        overall_total_sessions: number;
        overall_bounce_rate: number;
      }>([
        `${clix.toStartOf('e.created_at', interval as any)} AS date`,
        'dss.bounce_rate as bounce_rate',
        'uniq(e.profile_id) AS unique_visitors',
        'uniq(e.session_id) AS total_sessions',
        'round(avgIf(duration, duration > 0), 2) / 1000 AS _avg_session_duration',
        'if(isNaN(_avg_session_duration), 0, _avg_session_duration) AS avg_session_duration',
        'count(*) AS total_screen_views',
        'round((count(*) * 1.) / uniq(e.session_id), 2) AS views_per_session',
        '(SELECT unique_visitors FROM overall_unique_visitors) AS overall_unique_visitors',
        '(SELECT total_sessions FROM overall_unique_visitors) AS overall_total_sessions',
        '(SELECT bounce_rate FROM overall_bounce_rate) AS overall_bounce_rate',
      ])
      .from(`${TABLE_NAMES.events} AS e`)
      .leftJoin(
        'daily_session_stats AS dss',
        `${clix.toStartOf('e.created_at', interval as any)} = dss.date`,
      )
      .where('e.project_id', '=', projectId)
      .where('e.name', '=', 'screen_view')
      .where('e.created_at', 'BETWEEN', [
        clix.datetime(startDate, 'toDateTime'),
        clix.datetime(endDate, 'toDateTime'),
      ])
      .rawWhere(this.getRawWhereClause('events', filters))
      .groupBy(['date', 'dss.bounce_rate'])
      .orderBy('date', 'ASC')
      .fill(fillConfig.from, fillConfig.to, fillConfig.step)
      .transform({
        date: (item) => new Date(item.date).toISOString(),
      });

    // Revenue query
    const revenueQuery = this.createRevenueQuery({
      projectId,
      startDate,
      endDate,
      interval,
      timezone,
      filters,
    });

    // Execute both queries in parallel and merge results
    const [mainRes, revenueRes] = await Promise.all([
      mainQuery.execute(),
      revenueQuery.execute(),
    ]);

    const overallRevenue = this.getOverallRevenue(revenueRes);
    const series = this.mergeRevenueIntoSeries(mainRes, revenueRes);

    const anyRowWithData = mainRes.find(
      (item) =>
        item.overall_bounce_rate !== null ||
        item.overall_total_sessions !== null ||
        item.overall_unique_visitors !== null,
    );

    return {
      metrics: {
        bounce_rate: anyRowWithData?.overall_bounce_rate ?? 0,
        unique_visitors: anyRowWithData?.overall_unique_visitors ?? 0,
        total_sessions: anyRowWithData?.overall_total_sessions ?? 0,
        avg_session_duration: average(
          mainRes.map((item) => item.avg_session_duration),
        ),
        total_screen_views: sum(mainRes.map((item) => item.total_screen_views)),
        views_per_session: average(
          mainRes.map((item) => item.views_per_session),
        ),
        total_revenue: overallRevenue,
      },
      series,
    };
  }

  getRawWhereClause(type: 'events' | 'sessions', filters: IChartEventFilter[]) {
    const where = getEventFiltersWhereClause(
      filters.map((item) => {
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
          return item;
        }
        return item;
      }),
    );

    return Object.values(where).join(' AND ');
  }

  async getTopPages({
    projectId,
    filters,
    startDate,
    endDate,
    timezone,
  }: IGetTopPagesInput) {
    const selectColumns: (string | null | undefined | false)[] = [
      'origin',
      'path',
      'uniq(session_id) as sessions',
      'count() as pageviews',
    ];

    if (INCLUDE_REVENUE) {
      selectColumns.push('sum(revenue) as revenue');
    }

    const query = clix(this.client, timezone)
      .select<{
        origin: string;
        path: string;
        sessions: number;
        pageviews: number;
        revenue?: number;
      }>(selectColumns)
      .from(TABLE_NAMES.events, false)
      .where('project_id', '=', projectId)
      .where('name', '=', 'screen_view')
      .where('path', '!=', '')
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate, 'toDateTime'),
        clix.datetime(endDate, 'toDateTime'),
      ])
      .rawWhere(this.getRawWhereClause('events', filters))
      .groupBy(['origin', 'path'])
      .orderBy('sessions', 'DESC')
      .limit(MAX_RECORDS_LIMIT);

    return query.execute();
  }

  async getTopEntryExit({
    projectId,
    filters,
    startDate,
    endDate,
    mode,
    timezone,
  }: IGetTopEntryExitInput) {
    const selectColumns: (string | null | undefined | false)[] = [
      `${mode}_origin AS origin`,
      `${mode}_path AS path`,
      'sum(sign) as sessions',
      'sum(sign * screen_view_count) as pageviews',
    ];

    if (INCLUDE_REVENUE) {
      selectColumns.push('sum(revenue * sign) as revenue');
    }

    const query = clix(this.client, timezone)
      .select<{
        origin: string;
        path: string;
        sessions: number;
        pageviews: number;
        revenue?: number;
      }>(selectColumns)
      .from(TABLE_NAMES.sessions, true)
      .where('project_id', '=', projectId)
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate, 'toDateTime'),
        clix.datetime(endDate, 'toDateTime'),
      ])
      .groupBy([`${mode}_origin`, `${mode}_path`])
      .having('sum(sign)', '>', 0)
      .orderBy('sessions', 'DESC')
      .limit(MAX_RECORDS_LIMIT);

    const mainQuery = this.withDistinctSessionsIfNeeded(query, {
      projectId,
      filters,
      startDate,
      endDate,
      timezone,
    });

    return mainQuery.execute();
  }

  private getDistinctSessions({
    projectId,
    filters,
    startDate,
    endDate,
    timezone,
  }: {
    projectId: string;
    filters: IChartEventFilter[];
    startDate: string;
    endDate: string;
    timezone: string;
  }) {
    return clix(this.client, timezone)
      .select(['DISTINCT session_id'])
      .from(TABLE_NAMES.events)
      .where('project_id', '=', projectId)
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate, 'toDateTime'),
        clix.datetime(endDate, 'toDateTime'),
      ])
      .rawWhere(this.getRawWhereClause('events', filters));
  }

  async getTopGeneric({
    projectId,
    filters,
    startDate,
    endDate,
    column,
    timezone,
  }: IGetTopGenericInput) {
    const prefixColumn = COLUMN_PREFIX_MAP[column] ?? null;

    const selectColumns: (string | null | undefined | false)[] = [
      prefixColumn && `${prefixColumn} as prefix`,
      `nullIf(${column}, '') as name`,
      'sum(sign) as sessions',
      'sum(sign * screen_view_count) as pageviews',
    ];

    if (INCLUDE_REVENUE) {
      selectColumns.push('sum(revenue * sign) as revenue');
    }

    const query = clix(this.client, timezone)
      .select<{
        prefix?: string;
        name: string;
        sessions: number;
        pageviews: number;
        revenue?: number;
      }>(selectColumns)
      .from(TABLE_NAMES.sessions, true)
      .where('project_id', '=', projectId)
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate, 'toDateTime'),
        clix.datetime(endDate, 'toDateTime'),
      ])
      .groupBy([prefixColumn, column].filter(Boolean))
      .having('sum(sign)', '>', 0)
      .orderBy('sessions', 'DESC')
      .limit(MAX_RECORDS_LIMIT);

    const mainQuery = this.withDistinctSessionsIfNeeded(query, {
      projectId,
      filters,
      startDate,
      endDate,
      timezone,
    });

    return mainQuery.execute();
  }

  async getTopGenericSeries({
    projectId,
    filters,
    startDate,
    endDate,
    column,
    interval,
    timezone,
  }: IGetTopGenericSeriesInput): Promise<{
    items: Array<{
      name: string;
      prefix?: string;
      data: Array<{
        date: string;
        sessions: number;
        pageviews: number;
        revenue?: number;
      }>;
      total: { sessions: number; pageviews: number; revenue?: number };
    }>;
  }> {
    const prefixColumn = COLUMN_PREFIX_MAP[column] ?? null;
    const TOP_LIMIT = 500;
    const fillConfig = this.getFillConfig(interval, startDate, endDate);

    // Step 1: Get top 15 items
    const selectColumns: (string | null | undefined | false)[] = [
      prefixColumn && `${prefixColumn} as prefix`,
      `nullIf(${column}, '') as name`,
      'sum(sign) as sessions',
      'sum(sign * screen_view_count) as pageviews',
    ];

    if (INCLUDE_REVENUE) {
      selectColumns.push('sum(revenue * sign) as revenue');
    }

    const topItemsQuery = clix(this.client, timezone)
      .select<{
        prefix?: string;
        name: string;
        sessions: number;
        pageviews: number;
        revenue?: number;
      }>(selectColumns)
      .from(TABLE_NAMES.sessions, true)
      .where('project_id', '=', projectId)
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate, 'toDateTime'),
        clix.datetime(endDate, 'toDateTime'),
      ])
      .groupBy([prefixColumn, column].filter(Boolean))
      .having('sum(sign)', '>', 0)
      .orderBy('sessions', 'DESC')
      .limit(TOP_LIMIT);

    const mainTopItemsQuery = this.withDistinctSessionsIfNeeded(topItemsQuery, {
      projectId,
      filters,
      startDate,
      endDate,
      timezone,
    });

    const topItems = await mainTopItemsQuery.execute();

    if (topItems.length === 0) {
      return { items: [] };
    }

    // Step 2: Build time-series query for each top item
    const where = this.getRawWhereClause('sessions', filters);
    const timeSeriesSelectColumns: (string | null | undefined | false)[] = [
      `${clix.toStartOf('created_at', interval as any, timezone)} AS date`,
      prefixColumn && `${prefixColumn} as prefix`,
      `nullIf(${column}, '') as name`,
      'sum(sign) as sessions',
      'sum(sign * screen_view_count) as pageviews',
    ];

    if (INCLUDE_REVENUE) {
      timeSeriesSelectColumns.push('sum(revenue * sign) as revenue');
    }

    const timeSeriesQuery = clix(this.client, timezone)
      .select<{
        date: string;
        prefix?: string;
        name: string;
        sessions: number;
        pageviews: number;
        revenue?: number;
      }>(timeSeriesSelectColumns)
      .from(TABLE_NAMES.sessions, true)
      .where('project_id', '=', projectId)
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate, 'toDateTime'),
        clix.datetime(endDate, 'toDateTime'),
      ])
      .rawWhere(where)
      .groupBy(['date', prefixColumn, column].filter(Boolean))
      .having('sum(sign)', '>', 0)
      .orderBy('date', 'ASC')
      .fill(fillConfig.from, fillConfig.to, fillConfig.step)
      .transform({
        date: (item) => new Date(item.date).toISOString(),
      });

    const mainTimeSeriesQuery = this.withDistinctSessionsIfNeeded(
      timeSeriesQuery,
      {
        projectId,
        filters,
        startDate,
        endDate,
        timezone,
      },
    );

    const timeSeriesData = await mainTimeSeriesQuery.execute();

    // Step 3: Group time-series data by item and calculate totals
    const itemsMap = new Map<
      string,
      {
        name: string;
        prefix?: string;
        data: Array<{
          date: string;
          sessions: number;
          pageviews: number;
          revenue?: number;
        }>;
        total: { sessions: number; pageviews: number; revenue?: number };
      }
    >();

    // Initialize items from topItems
    for (const item of topItems) {
      const key = `${item.prefix || ''}:${item.name}`;
      itemsMap.set(key, {
        name: item.name,
        prefix: item.prefix,
        data: [],
        total: {
          sessions: item.sessions,
          pageviews: item.pageviews,
          revenue: item.revenue ?? 0,
        },
      });
    }

    // Populate time-series data
    for (const row of timeSeriesData) {
      const key = `${row.prefix || ''}:${row.name}`;
      const item = itemsMap.get(key);
      if (item) {
        item.data.push({
          date: row.date,
          sessions: row.sessions,
          pageviews: row.pageviews,
          revenue: row.revenue,
        });
      }
    }

    return {
      items: Array.from(itemsMap.values()),
    };
  }

  async getUserJourney({
    projectId,
    filters,
    startDate,
    endDate,
    steps = 5,
    timezone,
  }: IGetUserJourneyInput): Promise<{
    nodes: Array<{
      id: string;
      label: string;
      nodeColor: string;
      percentage?: number;
      value?: number;
      step?: number;
    }>;
    links: Array<{ source: string; target: string; value: number }>;
  }> {
    // Config
    const TOP_ENTRIES = 3; // Only show top 3 entry pages
    const TOP_DESTINATIONS_PER_NODE = 3; // Top 3 destinations from each node

    // Color palette - each entry page gets a consistent color
    const COLORS = chartColors.map((color) => color.main);

    // Step 1: Get session paths (deduped consecutive pages)
    const orderedEventsQuery = clix(this.client, timezone)
      .select<{
        session_id: string;
        path: string;
        created_at: string;
      }>(['session_id', 'concat(origin, path) as path', 'created_at'])
      .from(TABLE_NAMES.events)
      .where('project_id', '=', projectId)
      .where('name', '=', 'screen_view')
      .where('path', '!=', '')
      .where('path', 'IS NOT NULL')
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate, 'toDateTime'),
        clix.datetime(endDate, 'toDateTime'),
      ])
      .rawWhere(this.getRawWhereClause('events', filters))
      .orderBy('session_id', 'ASC')
      .orderBy('created_at', 'ASC');

    // Intermediate CTE to compute deduped paths
    const pathsDedupedCTE = clix(this.client, timezone)
      .with('ordered_events', orderedEventsQuery)
      .select<{
        session_id: string;
        paths_deduped: string[];
      }>([
        'session_id',
        `arraySlice(
          arrayFilter(
            (x, i) -> i = 1 OR x != paths_raw[i - 1],
            groupArray(path) as paths_raw,
            arrayEnumerate(paths_raw)
          ),
          1, ${steps}
        ) as paths_deduped`,
      ])
      .from('ordered_events')
      .groupBy(['session_id']);

    const sessionPathsQuery = clix(this.client, timezone)
      .with('paths_deduped_cte', pathsDedupedCTE)
      .select<{
        session_id: string;
        entry_page: string;
        paths: string[];
      }>([
        'session_id',
        // Truncate at first repeat
        `if(
          arrayFirstIndex(x -> x > 1, arrayEnumerateUniq(paths_deduped)) = 0,
          paths_deduped,
          arraySlice(
            paths_deduped,
            1,
            arrayFirstIndex(x -> x > 1, arrayEnumerateUniq(paths_deduped)) - 1
          )
        ) as paths`,
        // Entry page is first element
        'paths[1] as entry_page',
      ])
      .from('paths_deduped_cte')
      .having('length(paths)', '>=', 2);

    // Step 2: Find top 3 entry pages
    const topEntriesQuery = clix(this.client, timezone)
      .with('session_paths', sessionPathsQuery)
      .select<{ entry_page: string; count: number }>([
        'entry_page',
        'count() as count',
      ])
      .from('session_paths')
      .groupBy(['entry_page'])
      .orderBy('count', 'DESC')
      .limit(TOP_ENTRIES);

    const topEntries = await topEntriesQuery.execute();

    if (topEntries.length === 0) {
      return { nodes: [], links: [] };
    }

    const topEntryPages = topEntries.map((e) => e.entry_page);
    const totalSessions = topEntries.reduce((sum, e) => sum + e.count, 0);

    // Step 3: Get all transitions, but ONLY for sessions starting with top entries
    const transitionsQuery = clix(this.client, timezone)
      .with('paths_deduped_cte', pathsDedupedCTE)
      .with(
        'session_paths',
        clix(this.client, timezone)
          .select([
            'session_id',
            // Truncate at first repeat
            `if(
              arrayFirstIndex(x -> x > 1, arrayEnumerateUniq(paths_deduped)) = 0,
              paths_deduped,
              arraySlice(
                paths_deduped,
                1,
                arrayFirstIndex(x -> x > 1, arrayEnumerateUniq(paths_deduped)) - 1
              )
            ) as paths`,
          ])
          .from('paths_deduped_cte')
          .having('length(paths)', '>=', 2)
          // ONLY sessions starting with top entry pages
          .having('paths[1]', 'IN', topEntryPages),
      )
      .select<{
        source: string;
        target: string;
        step: number;
        value: number;
      }>([
        'pair.1 as source',
        'pair.2 as target',
        'pair.3 as step',
        'count() as value',
      ])
      .from(
        clix.exp(
          '(SELECT arrayJoin(arrayMap(i -> (paths[i], paths[i + 1], i), range(1, length(paths)))) as pair FROM session_paths WHERE length(paths) >= 2)',
        ),
      )
      .groupBy(['source', 'target', 'step'])
      .orderBy('step', 'ASC')
      .orderBy('value', 'DESC');

    const transitions = await transitionsQuery.execute();

    if (transitions.length === 0) {
      return { nodes: [], links: [] };
    }

    // Step 4: Build the sankey progressively step by step
    // Start with entry nodes, then follow top destinations at each step
    // Use unique node IDs by combining path with step to prevent circular references
    const nodes = new Map<
      string,
      { path: string; value: number; step: number; color: string }
    >();
    const links: Array<{ source: string; target: string; value: number }> = [];

    // Helper to create unique node ID
    const getNodeId = (path: string, step: number) => `${path}::step${step}`;

    // Group transitions by step
    const transitionsByStep = new Map<number, typeof transitions>();
    for (const t of transitions) {
      if (!transitionsByStep.has(t.step)) {
        transitionsByStep.set(t.step, []);
      }
      transitionsByStep.get(t.step)!.push(t);
    }

    // Initialize with entry pages (step 1)
    const activeNodes = new Map<string, string>(); // path -> nodeId
    topEntries.forEach((entry, idx) => {
      const nodeId = getNodeId(entry.entry_page, 1);
      nodes.set(nodeId, {
        path: entry.entry_page,
        value: entry.count,
        step: 1,
        color: COLORS[idx % COLORS.length]!,
      });
      activeNodes.set(entry.entry_page, nodeId);
    });

    // Process each step: from active nodes, find top destinations
    for (let step = 1; step < steps; step++) {
      const stepTransitions = transitionsByStep.get(step) || [];
      const nextActiveNodes = new Map<string, string>();

      // For each currently active node, find its top destinations
      for (const [sourcePath, sourceNodeId] of activeNodes) {
        // Get transitions FROM this source path
        const fromSource = stepTransitions
          .filter((t) => t.source === sourcePath)
          .sort((a, b) => b.value - a.value)
          .slice(0, TOP_DESTINATIONS_PER_NODE);

        for (const t of fromSource) {
          // Skip self-loops
          if (t.source === t.target) continue;

          const targetNodeId = getNodeId(t.target, step + 1);

          // Add link using unique node IDs
          links.push({
            source: sourceNodeId,
            target: targetNodeId,
            value: t.value,
          });

          // Add/update target node
          const existing = nodes.get(targetNodeId);
          if (existing) {
            existing.value += t.value;
          } else {
            // Inherit color from source or assign new
            const sourceData = nodes.get(sourceNodeId);
            nodes.set(targetNodeId, {
              path: t.target,
              value: t.value,
              step: step + 1,
              color: sourceData?.color || COLORS[nodes.size % COLORS.length]!,
            });
          }

          nextActiveNodes.set(t.target, targetNodeId);
        }
      }

      // Update active nodes for next iteration
      activeNodes.clear();
      for (const [path, nodeId] of nextActiveNodes) {
        activeNodes.set(path, nodeId);
      }

      // Stop if no more nodes to process
      if (activeNodes.size === 0) break;
    }

    // Step 5: Filter links by threshold (0.25% of total sessions)
    const MIN_LINK_PERCENT = 0.25;
    const minLinkValue = Math.ceil((totalSessions * MIN_LINK_PERCENT) / 100);
    const filteredLinks = links.filter((link) => link.value >= minLinkValue);

    // Step 6: Find all nodes referenced by remaining links
    const referencedNodeIds = new Set<string>();
    filteredLinks.forEach((link) => {
      referencedNodeIds.add(link.source);
      referencedNodeIds.add(link.target);
    });

    // Step 7: Recompute node values from filtered links (sum of incoming links)
    const nodeValuesFromLinks = new Map<string, number>();
    filteredLinks.forEach((link) => {
      // Add to target node value
      const current = nodeValuesFromLinks.get(link.target) || 0;
      nodeValuesFromLinks.set(link.target, current + link.value);
    });

    // For entry nodes (step 1), only keep them if they have outgoing links after filtering
    nodes.forEach((nodeData, nodeId) => {
      if (nodeData.step === 1) {
        const hasOutgoing = filteredLinks.some((l) => l.source === nodeId);
        if (!hasOutgoing) {
          // No outgoing links, remove entry node
          referencedNodeIds.delete(nodeId);
        }
      }
    });

    // Step 8: Build final nodes array sorted by step then value
    // Only include nodes that are referenced by filtered links
    const finalNodes = Array.from(nodes.entries())
      .filter(([id]) => referencedNodeIds.has(id))
      .map(([id, data]) => {
        // Use value from links for non-entry nodes, or original value for entry nodes with outgoing links
        const value =
          data.step === 1
            ? data.value
            : nodeValuesFromLinks.get(id) || data.value;
        return {
          id,
          label: data.path, // Add label for display
          nodeColor: data.color,
          percentage: (value / totalSessions) * 100,
          value,
          step: data.step,
        };
      })
      .sort((a, b) => {
        // Sort by step first, then by value descending
        if (a.step !== b.step) return a.step - b.step;
        return b.value - a.value;
      });

    // Sanity check: Ensure all link endpoints exist in nodes
    const nodeIds = new Set(finalNodes.map((n) => n.id));
    const invalidLinks = filteredLinks.filter(
      (link) => !nodeIds.has(link.source) || !nodeIds.has(link.target),
    );
    if (invalidLinks.length > 0) {
      console.warn(
        `UserJourney: Found ${invalidLinks.length} links with missing nodes`,
      );
      // Remove invalid links
      const validLinks = filteredLinks.filter(
        (link) => nodeIds.has(link.source) && nodeIds.has(link.target),
      );
      return {
        nodes: finalNodes,
        links: validLinks,
      };
    }

    // Sanity check: Ensure steps are monotonic (should always be true, but verify)
    const stepsValid = finalNodes.every((node, idx, arr) => {
      if (idx === 0) return true;
      return node.step! >= arr[idx - 1]!.step!;
    });
    if (!stepsValid) {
      console.warn('UserJourney: Steps are not monotonic');
    }

    return {
      nodes: finalNodes,
      links: filteredLinks,
    };
  }
}

export const overviewService = new OverviewService(ch);
