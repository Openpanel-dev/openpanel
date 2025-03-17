import { average, sum } from '@openpanel/common';
import { getCache } from '@openpanel/redis';
import { type IChartEventFilter, zTimeInterval } from '@openpanel/validation';
import { omit } from 'ramda';
import { z } from 'zod';
import { TABLE_NAMES, ch } from '../clickhouse/client';
import { clix } from '../clickhouse/query-builder';
import { getEventFiltersWhereClause } from './chart.service';

export const zGetMetricsInput = z.object({
  projectId: z.string(),
  filters: z.array(z.any()),
  startDate: z.string(),
  endDate: z.string(),
  interval: zTimeInterval,
});

export type IGetMetricsInput = z.infer<typeof zGetMetricsInput>;

export const zGetTopPagesInput = z.object({
  projectId: z.string(),
  filters: z.array(z.any()),
  startDate: z.string(),
  endDate: z.string(),
  interval: zTimeInterval,
  cursor: z.number().optional(),
  limit: z.number().optional(),
});

export type IGetTopPagesInput = z.infer<typeof zGetTopPagesInput>;

export const zGetTopEntryExitInput = z.object({
  projectId: z.string(),
  filters: z.array(z.any()),
  startDate: z.string(),
  endDate: z.string(),
  interval: zTimeInterval,
  mode: z.enum(['entry', 'exit']),
  cursor: z.number().optional(),
  limit: z.number().optional(),
});

export type IGetTopEntryExitInput = z.infer<typeof zGetTopEntryExitInput>;

export const zGetTopGenericInput = z.object({
  projectId: z.string(),
  filters: z.array(z.any()),
  startDate: z.string(),
  endDate: z.string(),
  interval: zTimeInterval,
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

export type IGetTopGenericInput = z.infer<typeof zGetTopGenericInput>;

export class OverviewService {
  private pendingQueries: Map<string, Promise<number | null>> = new Map();

  constructor(private client: typeof ch) {}

  isPageFilter(filters: IChartEventFilter[]) {
    return filters.some((filter) => filter.name === 'path' && filter.value);
  }

  getTotalSessions({
    projectId,
    startDate,
    endDate,
    filters,
  }: {
    projectId: string;
    startDate: string;
    endDate: string;
    filters: IChartEventFilter[];
  }) {
    const where = this.getRawWhereClause('sessions', filters);
    const key = `total_sessions_${projectId}_${startDate}_${endDate}_${JSON.stringify(filters)}`;

    // Check if there's already a pending query for this key
    const pendingQuery = this.pendingQueries.get(key);
    if (pendingQuery) {
      return pendingQuery.then((res) => res ?? 0);
    }

    // Create new query promise and store it
    const queryPromise = getCache(key, 15, async () => {
      try {
        const result = await clix(this.client)
          .select<{
            total_sessions: number;
          }>(['sum(sign) as total_sessions'])
          .from(TABLE_NAMES.sessions)
          .where('project_id', '=', projectId)
          .where('created_at', 'BETWEEN', [
            clix.datetime(startDate),
            clix.datetime(endDate),
          ])
          .rawWhere(where)
          .having('sum(sign)', '>', 0)
          .execute();
        return result?.[0]?.total_sessions ?? 0;
      } catch (error) {
        return 0;
      }
    });

    this.pendingQueries.set(key, queryPromise);
    return queryPromise;
  }

  getMetrics({
    projectId,
    filters,
    startDate,
    endDate,
    interval,
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
    const where = this.getRawWhereClause('sessions', filters);
    if (this.isPageFilter(filters)) {
      // Session aggregation with bounce rates
      const sessionAggQuery = clix(this.client)
        .select([
          `${clix.toStartOfInterval('created_at', interval, startDate)} AS date`,
          'round((countIf(is_bounce = 1 AND sign = 1) * 100.) / countIf(sign = 1), 2) AS bounce_rate',
        ])
        .from(TABLE_NAMES.sessions)
        .where('sign', '=', 1)
        .where('project_id', '=', projectId)
        .where('created_at', 'BETWEEN', [
          clix.datetime(startDate),
          clix.datetime(endDate),
        ])
        .rawWhere(where)
        .groupBy(['date'])
        .rollup()
        .orderBy('date', 'ASC');

      // Overall unique visitors
      const overallUniqueVisitorsQuery = clix(this.client)
        .select([
          'uniq(profile_id) AS unique_visitors',
          'uniq(session_id) AS total_sessions',
        ])
        .from(TABLE_NAMES.events)
        .where('project_id', '=', projectId)
        .where('name', '=', 'screen_view')
        .where('created_at', 'BETWEEN', [
          clix.datetime(startDate),
          clix.datetime(endDate),
        ])
        .rawWhere(this.getRawWhereClause('events', filters));

      return clix(this.client)
        .with('session_agg', sessionAggQuery)
        .with(
          'overall_bounce_rate',
          clix(this.client)
            .select(['bounce_rate'])
            .from('session_agg')
            .where('date', '=', clix.exp("'1970-01-01 00:00:00'")),
        )
        .with(
          'daily_stats',
          clix(this.client)
            .select(['date', 'bounce_rate'])
            .from('session_agg')
            .where('date', '!=', clix.exp("'1970-01-01 00:00:00'")),
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
          `${clix.toStartOfInterval('e.created_at', interval, startDate)} AS date`,
          'ds.bounce_rate AS bounce_rate',
          'uniq(e.profile_id) AS unique_visitors',
          'uniq(e.session_id) AS total_sessions',
          'round(avgIf(duration, duration > 0), 2) / 1000 AS _avg_session_duration',
          'if(isNaN(_avg_session_duration), 0, _avg_session_duration) AS avg_session_duration',
          'count(*) AS total_screen_views',
          'round((count(*) * 1.) / uniq(e.session_id), 2) AS views_per_session',
          'overall_unique_visitors.unique_visitors AS overall_unique_visitors',
          'overall_unique_visitors.total_sessions AS overall_total_sessions',
          'overall_bounce_rate.bounce_rate AS overall_bounce_rate',
        ])
        .from(`${TABLE_NAMES.events} AS e`)
        .leftJoin('overall_unique_visitors', '1 = 1')
        .leftJoin('overall_bounce_rate', '1 = 1')
        .leftJoin(
          'daily_stats AS ds',
          `${clix.toStartOfInterval('e.created_at', interval, startDate)} = ds.date`,
        )
        .where('e.project_id', '=', projectId)
        .where('e.name', '=', 'screen_view')
        .where('e.created_at', 'BETWEEN', [
          clix.datetime(startDate),
          clix.datetime(endDate),
        ])
        .rawWhere(this.getRawWhereClause('events', filters))
        .groupBy([
          'date',
          'ds.bounce_rate',
          'overall_unique_visitors.unique_visitors',
          'overall_unique_visitors.total_sessions',
          'overall_bounce_rate.bounce_rate',
        ])
        .orderBy('date', 'ASC')
        .fill(
          clix.toStartOfInterval(clix.datetime(startDate), interval, startDate),
          clix.toStartOfInterval(clix.datetime(endDate), interval, startDate),
          clix.toInterval('1', interval),
        )
        .transform({
          date: (item) => new Date(item.date).toISOString(),
        })
        .execute()
        .then((res) => {
          const metricsWithData = res.find(
            (item) => item.overall_bounce_rate !== 0,
          );
          return {
            metrics: {
              bounce_rate: metricsWithData?.bounce_rate ?? 0,
              unique_visitors: metricsWithData?.overall_unique_visitors ?? 0,
              total_sessions: metricsWithData?.overall_total_sessions ?? 0,
              avg_session_duration: average(
                res.map((item) => item.avg_session_duration),
              ),
              total_screen_views: sum(
                res.map((item) => item.total_screen_views),
              ),
              views_per_session: average(
                res.map((item) => item.views_per_session),
              ),
            },
            series: res.map(
              omit([
                'overall_bounce_rate',
                'overall_unique_visitors',
                'overall_total_sessions',
              ]),
            ),
          };
        });
    }

    const query = clix(this.client)
      .select<{
        date: string;
        bounce_rate: number;
        unique_visitors: number;
        total_sessions: number;
        avg_session_duration: number;
        total_screen_views: number;
        views_per_session: number;
      }>([
        `${clix.toStartOfInterval('created_at', interval, startDate)} AS date`,
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
        clix.datetime(startDate),
        clix.datetime(endDate),
      ])
      .where('project_id', '=', projectId)
      .rawWhere(where)
      .groupBy(['date'])
      .having('sum(sign)', '>', 0)
      .rollup()
      .orderBy('date', 'ASC')
      .fill(
        clix.toStartOfInterval(clix.datetime(startDate), interval, startDate),
        clix.toStartOfInterval(clix.datetime(endDate), interval, startDate),
        clix.toInterval('1', interval),
      )
      .transform({
        date: (item) => new Date(item.date).toISOString(),
      });

    return query.execute().then((res) => {
      // First row is the rollup row containing the total values
      return {
        metrics: {
          bounce_rate: res[0]?.bounce_rate ?? 0,
          unique_visitors: res[0]?.unique_visitors ?? 0,
          total_sessions: res[0]?.total_sessions ?? 0,
          avg_session_duration: res[0]?.avg_session_duration ?? 0,
          total_screen_views: res[0]?.total_screen_views ?? 0,
          views_per_session: res[0]?.views_per_session ?? 0,
        },
        series: res
          .slice(1)
          .map(omit(['overall_bounce_rate', 'overall_unique_visitors'])),
      };
    });
  }

  getRawWhereClause(type: 'events' | 'sessions', filters: IChartEventFilter[]) {
    const where = getEventFiltersWhereClause(
      filters
        .map((item) => {
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
        })
        .filter((item) => {
          if (this.isPageFilter(filters) && type === 'sessions') {
            return item.name !== 'entry_path' && item.name !== 'entry_origin';
          }
          return true;
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
  }: IGetTopPagesInput) {
    const pageStatsQuery = clix(this.client)
      .select([
        'origin',
        'path',
        'uniq(session_id) as count',
        'round(avg(duration)/1000, 2) as avg_duration',
      ])
      .from(TABLE_NAMES.events, false)
      .where('project_id', '=', projectId)
      .where('name', '=', 'screen_view')
      .where('path', '!=', '')
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate),
        clix.datetime(endDate),
      ])
      .groupBy(['origin', 'path'])
      .orderBy('count', 'DESC')
      .limit(limit)
      .offset((cursor - 1) * limit);

    const bounceStatsQuery = clix(this.client)
      .select([
        'entry_path',
        'entry_origin',
        'coalesce(round(countIf(is_bounce = 1 AND sign = 1) * 100.0 / countIf(sign = 1), 2), 0) as bounce_rate',
      ])
      .from(TABLE_NAMES.sessions)
      .where('sign', '=', 1)
      .where('project_id', '=', projectId)
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate),
        clix.datetime(endDate),
      ])
      .groupBy(['entry_path', 'entry_origin']);

    pageStatsQuery.rawWhere(this.getRawWhereClause('events', filters));
    bounceStatsQuery.rawWhere(this.getRawWhereClause('sessions', filters));

    const mainQuery = clix(this.client)
      .with('page_stats', pageStatsQuery)
      .with('bounce_stats', bounceStatsQuery)
      .select<{
        origin: string;
        path: string;
        avg_duration: number;
        bounce_rate: number;
        sessions: number;
      }>([
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

    const totalSessions = await this.getTotalSessions({
      projectId,
      startDate,
      endDate,
      filters,
    });

    return mainQuery.execute().then((res) => {
      return res.map((item) => ({
        ...item,
        total_sessions: totalSessions,
      }));
    });
  }

  async getTopEntryExit({
    projectId,
    filters,
    startDate,
    endDate,
    mode,
    cursor = 1,
    limit = 10,
  }: IGetTopEntryExitInput) {
    const where = this.getRawWhereClause('sessions', filters);

    const distinctSessionQuery = this.getDistinctSessions({
      projectId,
      filters,
      startDate,
      endDate,
    });

    const offset = (cursor - 1) * limit;

    const query = clix(this.client)
      .select<{
        origin: string;
        path: string;
        avg_duration: number;
        bounce_rate: number;
        sessions: number;
      }>([
        `${mode}_origin AS origin`,
        `${mode}_path AS path`,
        'round(avg(duration * sign)/1000, 2) as avg_duration',
        'round(sum(sign * is_bounce) * 100.0 / sum(sign), 2) as bounce_rate',
        'sum(sign) as sessions',
      ])
      .from(TABLE_NAMES.sessions)
      .where('project_id', '=', projectId)
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate),
        clix.datetime(endDate),
      ])
      .rawWhere(where)
      .groupBy([`${mode}_origin`, `${mode}_path`])
      .having('sum(sign)', '>', 0)
      .orderBy('sessions', 'DESC')
      .limit(limit)
      .offset(offset);

    let mainQuery = query;

    if (this.isPageFilter(filters)) {
      mainQuery = clix(this.client)
        .with('distinct_sessions', distinctSessionQuery)
        .merge(query)
        .where(
          'id',
          'IN',
          clix.exp('(SELECT session_id FROM distinct_sessions)'),
        );
    }

    const totalSessions = await this.getTotalSessions({
      projectId,
      startDate,
      endDate,
      filters,
    });

    return mainQuery.execute().then((res) => {
      return res.map((item) => ({
        ...item,
        total_sessions: totalSessions,
      }));
    });
  }

  private getDistinctSessions({
    projectId,
    filters,
    startDate,
    endDate,
  }: {
    projectId: string;
    filters: IChartEventFilter[];
    startDate: string;
    endDate: string;
  }) {
    return clix(this.client)
      .select(['DISTINCT session_id'])
      .from(TABLE_NAMES.events)
      .where('project_id', '=', projectId)
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate),
        clix.datetime(endDate),
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
  }: IGetTopGenericInput) {
    const distinctSessionQuery = this.getDistinctSessions({
      projectId,
      filters,
      startDate,
      endDate,
    });

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

    const offset = (cursor - 1) * limit;

    const query = clix(this.client)
      .select<{
        prefix?: string;
        name: string;
        sessions: number;
        bounce_rate: number;
        avg_session_duration: number;
      }>([
        prefixColumn && `${prefixColumn} as prefix`,
        `${column} as name`,
        'sum(sign) as sessions',
        'round(sum(sign * is_bounce) * 100.0 / sum(sign), 2) AS bounce_rate',
        'round(avgIf(duration, duration > 0 AND sign > 0), 2)/1000 AS avg_session_duration',
      ])
      .from(TABLE_NAMES.sessions)
      .where('project_id', '=', projectId)
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate),
        clix.datetime(endDate),
      ])
      .rawWhere(this.getRawWhereClause('sessions', filters))
      .groupBy([prefixColumn, column].filter(Boolean))
      .having('sum(sign)', '>', 0)
      .orderBy('sessions', 'DESC')
      .limit(limit)
      .offset(offset);

    let mainQuery = query;

    if (this.isPageFilter(filters)) {
      mainQuery = clix(this.client)
        .with('distinct_sessions', distinctSessionQuery)
        .merge(query)
        .where(
          'id',
          'IN',
          clix.exp('(SELECT session_id FROM distinct_sessions)'),
        );
    } else {
      // mainQuery.rawWhere(this.getRawWhereClause('sessions', filters));
    }

    const [res, totalSessions] = await Promise.all([
      mainQuery.execute(),
      this.getTotalSessions({
        projectId,
        startDate,
        endDate,
        filters,
      }),
    ]);

    return res.map((item) => ({
      ...item,
      total_sessions: totalSessions,
    }));
  }
}

export const overviewService = new OverviewService(ch);
