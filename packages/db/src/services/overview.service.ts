import { average, sum } from '@openpanel/common';
import { getCache } from '@openpanel/redis';
import { type IChartEventFilter, zTimeInterval } from '@openpanel/validation';
import { omit } from 'ramda';
import { z } from 'zod';
import { TABLE_NAMES, ch } from '../clickhouse/client';
import { clix } from '../clickhouse/query-builder';
import { getEventFiltersWhereClause } from './chart.service';

// Constants
const ROLLUP_DATE_PREFIX = '1970-01-01';

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
    cursor = 1,
    limit = 10,
    timezone,
  }: IGetTopPagesInput) {
    const pageStatsQuery = clix(this.client, timezone)
      .select([
        'origin',
        'path',
        `last_value(properties['__title']) as title`,
        'uniq(session_id) as count',
        'round(avg(duration)/1000, 2) as avg_duration',
      ])
      .from(TABLE_NAMES.events, false)
      .where('project_id', '=', projectId)
      .where('name', '=', 'screen_view')
      .where('path', '!=', '')
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate, 'toDateTime'),
        clix.datetime(endDate, 'toDateTime'),
      ])
      .groupBy(['origin', 'path'])
      .orderBy('count', 'DESC')
      .limit(limit)
      .offset((cursor - 1) * limit);

    const bounceStatsQuery = clix(this.client, timezone)
      .select([
        'entry_path',
        'entry_origin',
        'coalesce(round(countIf(is_bounce = 1 AND sign = 1) * 100.0 / countIf(sign = 1), 2), 0) as bounce_rate',
      ])
      .from(TABLE_NAMES.sessions, true)
      .where('sign', '=', 1)
      .where('project_id', '=', projectId)
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate, 'toDateTime'),
        clix.datetime(endDate, 'toDateTime'),
      ])
      .groupBy(['entry_path', 'entry_origin']);

    pageStatsQuery.rawWhere(this.getRawWhereClause('events', filters));
    bounceStatsQuery.rawWhere(this.getRawWhereClause('sessions', filters));

    const mainQuery = clix(this.client, timezone)
      .with('page_stats', pageStatsQuery)
      .with('bounce_stats', bounceStatsQuery)
      .select<{
        title: string;
        origin: string;
        path: string;
        avg_duration: number;
        bounce_rate: number;
        sessions: number;
        revenue: number;
      }>([
        'p.title',
        'p.origin',
        'p.path',
        'p.avg_duration',
        'p.count as sessions',
        'b.bounce_rate',
      ])
      .from('page_stats p', false)
      .leftJoin(
        'bounce_stats b',
        'p.path = b.entry_path AND p.origin = b.entry_origin',
      )
      .orderBy('sessions', 'DESC')
      .limit(limit);

    return mainQuery.execute();
  }

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
    const offset = (cursor - 1) * limit;

    const query = clix(this.client, timezone)
      .select<{
        origin: string;
        path: string;
        avg_duration: number;
        bounce_rate: number;
        sessions: number;
        revenue: number;
      }>([
        `${mode}_origin AS origin`,
        `${mode}_path AS path`,
        'round(avg(duration * sign)/1000, 2) as avg_duration',
        'round(sum(sign * is_bounce) * 100.0 / sum(sign), 2) as bounce_rate',
        'sum(sign) as sessions',
        'sum(revenue * sign) as revenue',
      ])
      .from(TABLE_NAMES.sessions, true)
      .where('project_id', '=', projectId)
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate, 'toDateTime'),
        clix.datetime(endDate, 'toDateTime'),
      ])
      .groupBy([`${mode}_origin`, `${mode}_path`])
      .having('sum(sign)', '>', 0)
      .orderBy('sessions', 'DESC')
      .limit(limit)
      .offset(offset);

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
    cursor = 1,
    limit = 10,
    timezone,
  }: IGetTopGenericInput) {
    const prefixColumn = COLUMN_PREFIX_MAP[column] ?? null;
    const offset = (cursor - 1) * limit;

    const query = clix(this.client, timezone)
      .select<{
        prefix?: string;
        name: string;
        sessions: number;
        bounce_rate: number;
        avg_session_duration: number;
        revenue: number;
      }>([
        prefixColumn && `${prefixColumn} as prefix`,
        `nullIf(${column}, '') as name`,
        'sum(sign) as sessions',
        'round(sum(sign * is_bounce) * 100.0 / sum(sign), 2) AS bounce_rate',
        'round(avgIf(duration, duration > 0 AND sign > 0), 2)/1000 AS avg_session_duration',
        'sum(revenue * sign) as revenue',
      ])
      .from(TABLE_NAMES.sessions, true)
      .where('project_id', '=', projectId)
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate, 'toDateTime'),
        clix.datetime(endDate, 'toDateTime'),
      ])
      .groupBy([prefixColumn, column].filter(Boolean))
      .having('sum(sign)', '>', 0)
      .orderBy('sessions', 'DESC')
      .limit(limit)
      .offset(offset);

    const mainQuery = this.withDistinctSessionsIfNeeded(query, {
      projectId,
      filters,
      startDate,
      endDate,
      timezone,
    });

    return mainQuery.execute();
  }
}

export const overviewService = new OverviewService(ch);
