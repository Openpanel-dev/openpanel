// Ported from packages/db/src/services/pages.service.ts. The ClickHouse
// queries moved to src/pages.sql.ts (ADR-013, M7-005); `PagesService` keeps
// V1's `constructor(client: typeof ch)` shape — the mcp
// `get_page_performance` tool constructs a fresh instance per call to dodge a
// module-singleton mocking hazard (see page-performance.ts), so the
// constructor's client really is caller-supplied.

import type { ClickHouseClient } from '@clickhouse/client';
import type { IChartEventFilter, IInterval } from '@openpanel/validation';
import { getSettingsForProject } from '../organization/organization.service';
import { OverviewService } from './overview.service';
import {
  pageConversionsQuery,
  pageTimeseriesQuery,
  topPagesQuery,
} from './src/pages.sql';
import { runQuery } from './src/run-query';

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
  /** No client means the singleton path — `run-query.ts` resolves `ch` lazily. */
  constructor(private client?: ClickHouseClient) {}

  async getTopPages({
    projectId,
    startDate,
    endDate,
    timezone,
    search,
    limit,
  }: IGetPagesInput): Promise<ITopPage[]> {
    return runQuery<ITopPage>(
      this.client,
      topPagesQuery({ projectId, startDate, endDate, search, limit }),
      timezone
    );
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
    return runQuery<IPageTimeseriesRow>(
      this.client,
      pageTimeseriesQuery({
        projectId,
        startDate,
        endDate,
        interval,
        filterOrigin,
        filterPath,
      }),
      timezone
    );
  }
}

export const pagesService = new PagesService();
const overviewServiceForPages = new OverviewService();

export async function getTopPagesCore(input: {
  projectId: string;
  startDate: string;
  endDate: string;
  limit?: number;
  filters?: IChartEventFilter[];
}) {
  const { timezone } = await getSettingsForProject(input.projectId);
  return overviewServiceForPages.getTopPages({
    projectId: input.projectId,
    filters: input.filters ?? [],
    startDate: input.startDate,
    endDate: input.endDate,
    timezone,
    limit: input.limit,
  });
}

export async function getEntryExitPagesCore(input: {
  projectId: string;
  startDate: string;
  endDate: string;
  mode: 'entry' | 'exit';
  limit?: number;
  filters?: IChartEventFilter[];
}) {
  const { timezone } = await getSettingsForProject(input.projectId);
  return overviewServiceForPages.getTopEntryExit({
    projectId: input.projectId,
    filters: input.filters ?? [],
    startDate: input.startDate,
    endDate: input.endDate,
    mode: input.mode,
    timezone,
    limit: input.limit,
  });
}

export async function getPagePerformanceCore(input: {
  projectId: string;
  startDate: string;
  endDate: string;
  search?: string;
  sortBy?: 'sessions' | 'pageviews' | 'bounce_rate' | 'avg_duration';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}) {
  const { timezone } = await getSettingsForProject(input.projectId);
  const results = await pagesService.getTopPages({
    projectId: input.projectId,
    startDate: input.startDate,
    endDate: input.endDate,
    timezone,
    search: input.search,
    limit: 1000,
  });

  const col = input.sortBy ?? 'sessions';
  const dir = input.sortOrder === 'asc' ? 1 : -1;
  const sorted = [...results].sort(
    (a, b) => dir * ((a[col] ?? 0) < (b[col] ?? 0) ? -1 : 1)
  );
  const limited = sorted.slice(0, input.limit ?? 50);

  const annotated = limited.map((p) => ({
    ...p,
    seo_signals: {
      high_bounce: p.bounce_rate > 70,
      low_engagement: p.avg_duration < 1,
      good_landing_page: p.bounce_rate < 40 && p.avg_duration > 2,
    },
  }));

  return {
    total_pages: results.length,
    shown: annotated.length,
    pages: annotated,
  };
}

export interface IPageConversionRow {
  path: string;
  origin: string;
  unique_converters: number;
  total_visitors: number;
  conversion_rate: number;
}

const DEFAULT_CONVERSION_WINDOW_HOURS = 24;
const DEFAULT_CONVERSION_LIMIT = 100;

export async function getPageConversionsCore(input: {
  projectId: string;
  startDate: string;
  endDate: string;
  conversionEvent: string;
  windowHours?: number;
  limit?: number;
}): Promise<IPageConversionRow[]> {
  return runQuery<IPageConversionRow>(
    undefined,
    pageConversionsQuery({
      projectId: input.projectId,
      startDate: input.startDate,
      endDate: input.endDate,
      conversionEvent: input.conversionEvent,
      windowHours: input.windowHours ?? DEFAULT_CONVERSION_WINDOW_HOURS,
      limit: input.limit ?? DEFAULT_CONVERSION_LIMIT,
    }),
    'UTC'
  );
}
