// The two pure series helpers live here, not on report.service.ts, because
// the chart module needs them and report.service.ts imports the chart
// engine — a static import back would close a real cycle (report.service ->
// chart/funnel.service -> report.service). Nothing here touches a database,
// so both sides stay eager and neither needs a lazy loader.

import type { IChartEventFilter, IChartEventItem } from '../report.constants';

/** The event half of the discriminated series union — what every caller then
 *  reads `.name` / `.filters` off. */
export type ReportEventItem = Extract<IChartEventItem, { type: 'event' }>;

export function onlyReportEvents(series: IChartEventItem[]): ReportEventItem[] {
  return series.filter(
    (item): item is ReportEventItem => item.type === 'event'
  );
}

/**
 * Prepend report-level global filters to every event series' own filters.
 * Combining is AND (filters already combine with AND in getEventFiltersWhereClause).
 * Formulas reference other series, so they inherit the global filters transitively
 * and are left untouched here.
 */
export function mergeGlobalFilters(
  series: IChartEventItem[],
  globalFilters: IChartEventFilter[] = []
): IChartEventItem[] {
  if (!globalFilters.length) {
    return series;
  }
  return series.map((item) =>
    item.type === 'event'
      ? { ...item, filters: [...globalFilters, ...item.filters] }
      : item
  );
}
