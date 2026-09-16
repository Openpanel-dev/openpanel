// Ported from packages/db/src/services/pages.service.ts. The ClickHouse
// queries moved to src/pages.sql.ts (ADR-013, M7-005).
//
// M10-005: `PagesService` is no longer a class and there is no `pagesService`
// module singleton. It is registered as its OWN service (`services.pages`)
// rather than folded into `overview`, because both expose a `getTopPages` and
// they are different queries with different inputs — one over `events` scoped
// by search, one over `sessions` scoped by filters. Folding them would have
// had to rename one, which is a call-site contract this wave does not change.
// The caller-supplied `constructor(client)` slot is gone: the mcp
// `get_page_performance` tool constructed a fresh instance per call only to
// dodge a module-singleton mocking hazard, and there is no singleton left to
// dodge.

import type { ServiceDeps, Services } from '../../services';
import { getSettingsForProject } from '../organization/organization.service';
import type { IChartEventFilter, IInterval } from '../report/report.constants';
import {
  getTopPages as getOverviewTopPages,
  getTopEntryExit,
} from './overview.service';
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

export function getTopPages(
  deps: ServiceDeps,
  { projectId, startDate, endDate, timezone, search, limit }: IGetPagesInput
): Promise<ITopPage[]> {
  return runQuery<ITopPage>(
    deps,
    topPagesQuery({ projectId, startDate, endDate, search, limit }),
    timezone
  );
}

export interface IGetPageTimeseriesInput extends IGetPagesInput {
  interval: IInterval;
  filterOrigin?: string;
  filterPath?: string;
  /** Unbounded when omitted; see `PageTimeseriesQueryInput`. */
  topPagesPerBucket?: number;
}

export function getPageTimeseries(
  deps: ServiceDeps,
  {
    projectId,
    startDate,
    endDate,
    timezone,
    interval,
    filterOrigin,
    filterPath,
    topPagesPerBucket,
  }: IGetPageTimeseriesInput
): Promise<IPageTimeseriesRow[]> {
  return runQuery<IPageTimeseriesRow>(
    deps,
    pageTimeseriesQuery({
      projectId,
      startDate,
      endDate,
      interval,
      filterOrigin,
      filterPath,
      topPagesPerBucket,
    }),
    timezone
  );
}

export async function getTopPagesCore(
  deps: ServiceDeps,
  input: {
    projectId: string;
    startDate: string;
    endDate: string;
    limit?: number;
    filters?: IChartEventFilter[];
  }
) {
  const { timezone } = await getSettingsForProject(deps, input.projectId);
  return getOverviewTopPages(deps, {
    projectId: input.projectId,
    filters: input.filters ?? [],
    startDate: input.startDate,
    endDate: input.endDate,
    timezone,
    limit: input.limit,
  });
}

export async function getEntryExitPagesCore(
  deps: ServiceDeps,
  input: {
    projectId: string;
    startDate: string;
    endDate: string;
    mode: 'entry' | 'exit';
    limit?: number;
    filters?: IChartEventFilter[];
  }
) {
  const { timezone } = await getSettingsForProject(deps, input.projectId);
  return getTopEntryExit(deps, {
    projectId: input.projectId,
    filters: input.filters ?? [],
    startDate: input.startDate,
    endDate: input.endDate,
    mode: input.mode,
    timezone,
    limit: input.limit,
  });
}

export async function getPagePerformanceCore(
  deps: ServiceDeps,
  input: {
    projectId: string;
    startDate: string;
    endDate: string;
    search?: string;
    sortBy?: 'sessions' | 'pageviews' | 'bounce_rate' | 'avg_duration';
    sortOrder?: 'asc' | 'desc';
    limit?: number;
  }
) {
  const { timezone } = await getSettingsForProject(deps, input.projectId);
  const results = await getTopPages(deps, {
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

export async function getPageConversionsCore(
  deps: ServiceDeps,
  input: {
    projectId: string;
    startDate: string;
    endDate: string;
    conversionEvent: string;
    windowHours?: number;
    limit?: number;
  }
): Promise<IPageConversionRow[]> {
  return runQuery<IPageConversionRow>(
    deps,
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

export function createPagesService(
  deps: ServiceDeps,
  _services: () => Services
) {
  return {
    getTopPages: (input: IGetPagesInput): Promise<ITopPage[]> =>
      getTopPages(deps, input),
    getPageTimeseries: (
      input: IGetPageTimeseriesInput
    ): Promise<IPageTimeseriesRow[]> => getPageTimeseries(deps, input),
    getTopPagesCore: (
      input: Parameters<typeof getTopPagesCore>[1]
    ): ReturnType<typeof getTopPagesCore> => getTopPagesCore(deps, input),
    getEntryExitPagesCore: (
      input: Parameters<typeof getEntryExitPagesCore>[1]
    ): ReturnType<typeof getEntryExitPagesCore> =>
      getEntryExitPagesCore(deps, input),
    getPagePerformanceCore: (
      input: Parameters<typeof getPagePerformanceCore>[1]
    ): ReturnType<typeof getPagePerformanceCore> =>
      getPagePerformanceCore(deps, input),
    getPageConversionsCore: (
      input: Parameters<typeof getPageConversionsCore>[1]
    ): Promise<IPageConversionRow[]> => getPageConversionsCore(deps, input),
  };
}
