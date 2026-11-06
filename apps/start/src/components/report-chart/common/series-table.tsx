import { useCallback, useMemo } from 'react';
import { useReportChartContext } from '../context';
import { PreviousDiffIndicatorPure } from './previous-diff-indicator';
import { SerieIcon } from './serie-icon';
import { seriesMetricColumns } from './series-metric-columns';
import {
  type ReportColumn,
  ReportDataTable,
  type ReportRowIdentity,
} from '@/components/report-table/report-data-table';
import { useFormatDateInterval } from '@/hooks/use-format-date-interval';
import { useNumber } from '@/hooks/use-numer-formatter';
import type { IChartData } from '@/trpc/client';
import { getChartColor } from '@/utils/theme';

type Serie = IChartData['series'][number];

interface SeriesRow {
  id: string;
  serie: Serie;
  color: string;
  countByDate: Record<string, number>;
}

interface Props {
  data: IChartData;
  visibleIds: ReadonlySet<string>;
  /** Absent on read-only pages, which hides the checkboxes. */
  onToggle?: (id: string) => void;
  onUnselectAll?: () => void;
  onReset?: () => void;
}

const BREAKDOWN_COLUMN_WIDTH = 140;

/** One row per series: its breakdown values, the summary metrics and a heat-shaded cell per period. */
export function SeriesTable({
  data,
  visibleIds,
  onToggle,
  onUnselectAll,
  onReset,
}: Props) {
  const {
    report: { interval, unit, breakdowns, name, chartType },
  } = useReportChartContext();
  const number = useNumber();
  const formatDate = useFormatDateInterval({ interval, short: true });
  const formatValue = useCallback(
    (value: number) => number.formatWithUnit(value, unit),
    [number, unit]
  );

  const dates = useMemo(
    () => data.series[0]?.data.map((item) => item.date) ?? [],
    [data.series]
  );
  const rows = useMemo(
    () =>
      data.series.map(
        (serie, index): SeriesRow => ({
          id: serie.id,
          serie,
          color: getChartColor(index),
          countByDate: Object.fromEntries(
            serie.data.map((item) => [item.date, item.count])
          ),
        })
      ),
    [data.series]
  );

  const identity = useMemo<ReportRowIdentity<SeriesRow>>(
    () => ({
      header: 'Series',
      render: (row) => (
        <span className="flex items-center gap-1.5">
          <SerieIcon name={row.serie.names[0] ?? ''} />
          <span className="truncate">{row.serie.names[0]}</span>
        </span>
      ),
      searchText: (row) => row.serie.names.join(' › '),
      color: (row) => row.color,
    }),
    []
  );

  const columns = useMemo<ReportColumn<SeriesRow>[]>(
    () => [
      ...(breakdowns ?? []).map(
        (breakdown, index): ReportColumn<SeriesRow> => ({
          id: `breakdown:${breakdown.name}`,
          header: breakdown.name,
          value: (row) => row.serie.names[index + 1] ?? '',
          format: 'text',
          width: BREAKDOWN_COLUMN_WIDTH,
        })
      ),
      ...seriesMetricColumns(chartType).map(
        ({ key, header }): ReportColumn<SeriesRow> => ({
          id: key,
          header,
          value: (row) => row.serie.metrics[key],
          render: (row) => {
            const previous = row.serie.metrics.previous?.[key];
            return (
              <span className="flex items-center justify-end gap-2">
                {formatValue(row.serie.metrics[key] ?? 0)}
                {previous && key === 'sum' && (
                  <PreviousDiffIndicatorPure {...previous} size="xs" />
                )}
              </span>
            );
          },
        })
      ),
      ...dates.map(
        (date): ReportColumn<SeriesRow> => ({
          id: date,
          // A distribution's columns are buckets, not periods.
          header: chartType === 'distribution' ? date : formatDate(date),
          value: (row) => row.countByDate[date] ?? 0,
          render: (row) => formatValue(row.countByDate[date] ?? 0),
          decorate: 'heat',
        })
      ),
    ],
    [breakdowns, chartType, dates, formatDate, formatValue]
  );

  return (
    <ReportDataTable
      columns={columns}
      csvFilename={name || 'report'}
      getRowId={(row) => row.id}
      identity={identity}
      onReset={onReset}
      onToggleRow={onToggle}
      onUnselectAll={onUnselectAll}
      rows={rows}
      selectedIds={visibleIds}
    />
  );
}
