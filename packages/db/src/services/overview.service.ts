import type { IChartEventFilter } from '@openpanel/validation';
import { TABLE_NAMES, ch } from '../clickhouse/client';
import { clix } from '../clickhouse/query-builder';
import { getEventFiltersWhereClause } from './chart.service';

export class OverviewService {
  constructor(private client: typeof ch) {}

  isPageFilter(filters: IChartEventFilter[]) {
    return filters.some((filter) => filter.name === 'path');
  }

  getTopPages({
    projectId,
    filters,
    startDate,
    endDate,
  }: {
    projectId: string;
    filters: IChartEventFilter[];
    startDate: Date;
    endDate: Date;
  }) {
    const where = getEventFiltersWhereClause(filters);

    const pageStatsQuery = clix(this.client)
      .select([
        'origin',
        'path',
        'count(*) as count',
        'countDistinct(profile_id) as unique_visitors',
        'countDistinct(session_id) as unique_sessions',
        'round(avg(duration)/1000, 2) as avg_duration',
      ])
      .from(TABLE_NAMES.events, false)
      .where('project_id', '=', projectId)
      .where('name', '=', 'screen_view')
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate),
        clix.datetime(endDate),
      ])
      .groupBy(['origin', 'path']);

    const totalSessionsQuery = clix(this.client)
      .select([
        'count(*) as total_sessions',
        'sum(screen_view_count) as total_screen_views',
      ])
      .from(TABLE_NAMES.sessions)
      .where('sign', '=', 1)
      .andWhere('project_id', '=', projectId)
      .andWhere('created_at', 'BETWEEN', [
        clix.datetime(startDate),
        clix.datetime(endDate),
      ]);

    const bounceStatsQuery = clix(this.client)
      .select([
        'entry_path',
        'round(countIf(is_bounce = 1 AND sign = 1) * 100.0 / countIf(sign = 1), 2) as bounce_rate',
      ])
      .from(TABLE_NAMES.sessions)
      .where('sign', '=', 1)
      .where('project_id', '=', projectId)
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate),
        clix.datetime(endDate),
      ])
      .groupBy(['entry_path']);

    for (const item of Object.values(where)) {
      pageStatsQuery.rawWhere(item);
      totalSessionsQuery.rawWhere(item);
      bounceStatsQuery.rawWhere(item);
    }

    const mainQuery = clix(this.client)
      .with('page_stats', pageStatsQuery)
      .with('total_sessions', totalSessionsQuery)
      .with('bounce_stats', bounceStatsQuery)
      .select([
        'p.origin',
        'p.path',
        'p.count as screen_views',
        'p.avg_duration',
        'COALESCE(b.bounce_rate, 0) as bounce_rate',
        'p.unique_visitors',
        'p.unique_sessions',
        'ts.total_sessions',
        'ts.total_screen_views',
      ])
      .from('page_stats p', false)
      .leftJoin('bounce_stats b', 'p.path = b.entry_path')
      .leftJoin('total_sessions ts', '1 = 1')
      .orderBy('p.count', 'DESC')
      .limit(10);

    return mainQuery.execute<{
      origin: string;
      path: string;
      screen_views: number;
      avg_duration: number;
      bounce_rate: number;
      unique_visitors: number;
      unique_sessions: number;
      total_sessions: number;
      total_screen_views: number;
    }>();
  }
}

export const overviewService = new OverviewService(ch);
