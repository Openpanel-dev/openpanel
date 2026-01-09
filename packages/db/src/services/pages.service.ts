import { TABLE_NAMES, ch } from '../clickhouse/client';
import { clix } from '../clickhouse/query-builder';

export interface IGetPagesInput {
  projectId: string;
  startDate: string;
  endDate: string;
  timezone: string;
  search?: string;
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
      .from(`${TABLE_NAMES.events} e`, false)
      .leftJoin(
        sessionsSubquery,
        'e.session_id = s.id AND e.project_id = s.project_id',
        's',
      )
      .leftJoin('page_titles pt', 'concat(e.origin, e.path) = pt.page_key')
      .where('e.project_id', '=', projectId)
      .where('e.name', '=', 'screen_view')
      .where('e.path', '!=', '')
      .where('e.created_at', 'BETWEEN', [
        clix.datetime(startDate, 'toDateTime'),
        clix.datetime(endDate, 'toDateTime'),
      ])
      .when(!!search, (q) => {
        q.where('e.path', 'LIKE', `%${search}%`);
      })
      .groupBy(['e.origin', 'e.path', 'pt.title'])
      .orderBy('sessions', 'DESC')
      .limit(1000);

    return query.execute();
  }
}

export const pagesService = new PagesService(ch);
