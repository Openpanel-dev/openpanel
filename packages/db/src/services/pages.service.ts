import type { IInterval } from '@openpanel/validation';
import { ch, TABLE_NAMES } from '../clickhouse/client';
import { clix } from '../clickhouse/query-builder';

export interface IGetPagesInput {
  projectId: string;
  startDate: string;
  endDate: string;
  timezone: string;
  search?: string;
  limit?: number;
}

export interface IPageTimeseriesRow {
  origin: string;
  path: string;
  date: string;
  pageviews: number;
  sessions: number;
}

export interface ITopPage {
  origin: string;
  path: string;
  title: string;
  sessions: number;
  pageviews: number;
  avg_duration: number;
  bounce_rate: number;
}

export class PagesService {
  constructor(private client: typeof ch) {}

  async getTopPages({
    projectId,
    startDate,
    endDate,
    timezone,
    search,
    limit,
  }: IGetPagesInput): Promise<ITopPage[]> {
    // CTE: Get titles from the last 30 days for faster retrieval
    const titlesCte = clix(this.client, timezone)
      .select([
        'concat(origin, path) as page_key',
        "anyLast(properties['__title']) as title",
      ])
      .from(TABLE_NAMES.events, false)
      .where('project_id', '=', projectId)
      .where('name', '=', 'screen_view')
      .where('created_at', '>=', clix.exp('now() - INTERVAL 30 DAY'))
      .groupBy(['origin', 'path']);

    // CTE: compute screen_view durations via window function (leadInFrame gives next event's timestamp)
    const screenViewDurationsCte = clix(this.client, timezone)
      .select([
        'project_id',
        'session_id',
        'path',
        'origin',
        `dateDiff('millisecond', created_at, lead(created_at, 1, created_at) OVER (PARTITION BY session_id ORDER BY created_at)) AS duration`,
      ])
      .from(TABLE_NAMES.events, false)
      .where('project_id', '=', projectId)
      .where('name', '=', 'screen_view')
      .where('path', '!=', '')
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate, 'toDateTime'),
        clix.datetime(endDate, 'toDateTime'),
      ]);

    // Pre-filtered sessions subquery for better performance
    const sessionsSubquery = clix(this.client, timezone)
      .select(['id', 'project_id', 'is_bounce'])
      .from(TABLE_NAMES.sessions, true) // FINAL
      .where('project_id', '=', projectId)
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate, 'toDateTime'),
        clix.datetime(endDate, 'toDateTime'),
      ])
      .where('sign', '=', 1);

    // Main query: aggregate events and calculate bounce rate from pre-filtered sessions
    const query = clix(this.client, timezone)
      .with('page_titles', titlesCte)
      .with('screen_view_durations', screenViewDurationsCte)
      .select<ITopPage>([
        'e.origin as origin',
        'e.path as path',
        "coalesce(pt.title, '') as title",
        'uniq(e.session_id) as sessions',
        'count() as pageviews',
        'round(avg(e.duration) / 1000 / 60, 2) as avg_duration',
        `round(
          (uniqIf(e.session_id, s.is_bounce = 1) * 100.0) /
          nullIf(uniq(e.session_id), 0),
          2
        ) as bounce_rate`,
      ])
      .from('screen_view_durations e', false)
      .leftJoin(
        sessionsSubquery,
        'e.session_id = s.id AND e.project_id = s.project_id',
        's'
      )
      .leftJoin('page_titles pt', 'concat(e.origin, e.path) = pt.page_key')
      .when(!!search, (q) => {
        const term = `%${search}%`;
        q.whereGroup()
          .where('e.path', 'LIKE', term)
          .orWhere('e.origin', 'LIKE', term)
          .orWhere('pt.title', 'LIKE', term)
          .end();
      })
      .groupBy(['e.origin', 'e.path', 'pt.title'])
      .orderBy('sessions', 'DESC');
    if (limit !== undefined) {
      query.limit(limit);
    }
    return query.execute();
  }

  async getPageTimeseries({
    projectId,
    startDate,
    endDate,
    timezone,
    interval,
    filterOrigin,
    filterPath,
  }: IGetPagesInput & {
    interval: IInterval;
    filterOrigin?: string;
    filterPath?: string;
  }): Promise<IPageTimeseriesRow[]> {
    const dateExpr = clix.toStartOf('e.created_at', interval, timezone);
    const useDateOnly = interval === 'month' || interval === 'week';
    const fillFrom = clix.toStartOf(
      clix.datetime(startDate, useDateOnly ? 'toDate' : 'toDateTime'),
      interval
    );
    const fillTo = clix.datetime(
      endDate,
      useDateOnly ? 'toDate' : 'toDateTime'
    );
    const fillStep = clix.toInterval('1', interval);

    return clix(this.client, timezone)
      .select<IPageTimeseriesRow>([
        'e.origin as origin',
        'e.path as path',
        `${dateExpr} AS date`,
        'count() as pageviews',
        'uniq(e.session_id) as sessions',
      ])
      .from(`${TABLE_NAMES.events} e`, false)
      .where('e.project_id', '=', projectId)
      .where('e.name', '=', 'screen_view')
      .where('e.path', '!=', '')
      .where('e.created_at', 'BETWEEN', [
        clix.datetime(startDate, 'toDateTime'),
        clix.datetime(endDate, 'toDateTime'),
      ])
      .when(!!filterOrigin, (q) => q.where('e.origin', '=', filterOrigin!))
      .when(!!filterPath, (q) => q.where('e.path', '=', filterPath!))
      .groupBy(['e.origin', 'e.path', 'date'])
      .orderBy('date', 'ASC')
      .fill(fillFrom, fillTo, fillStep)
      .execute();
  }
}

export const pagesService = new PagesService(ch);
