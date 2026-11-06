import type { IChartType } from '@openpanel/core/modules/report/report.constants';

const METRIC_COLUMNS = [
  { key: 'count', header: 'Unique' },
  { key: 'sum', header: 'Sum' },
  { key: 'average', header: 'Average' },
  { key: 'min', header: 'Min' },
  { key: 'max', header: 'Max' },
] as const;

export interface SeriesMetricColumn {
  key: (typeof METRIC_COLUMNS)[number]['key'];
  header: string;
}

/**
 * The summary columns a series row shows. A distribution's points are user
 * counts per bucket, so sum/average/min/max over them would read as per-user
 * figures; it keeps only the number of users.
 */
export function seriesMetricColumns(
  chartType: IChartType | undefined
): readonly SeriesMetricColumn[] {
  if (chartType === 'distribution') {
    return [{ key: 'count', header: 'Users' }];
  }
  return METRIC_COLUMNS;
}
