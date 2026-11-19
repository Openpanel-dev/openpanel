import { average } from '@openpanel/shared';
import { useMemo } from 'react';
import { getPreviousMetric } from '../../../utils/previous-metric';
import { PreviousDiffIndicatorPure } from '../common/previous-diff-indicator';
import { SerieIcon } from '../common/serie-icon';
import { SerieName } from '../common/serie-name';
import { useReportChartContext } from '../context';
import {
  type ReportColumn,
  ReportDataTable,
  type ReportRowIdentity,
} from '@/components/report-table/report-data-table';
import { useFormatDateInterval } from '@/hooks/use-format-date-interval';
import type { RouterOutputs } from '@/trpc/client';
import { getChartColor } from '@/utils/theme';

type ConversionData = RouterOutputs['chart']['conversion'];

interface ConversionRow {
  id: string;
  names: string[];
  color: string;
  averageRate: number;
  previousAverageRate: number | undefined;
  total: number;
  conversions: number;
  rateByDate: Record<string, number>;
}

interface Props {
  data: ConversionData;
  visibleIds: ReadonlySet<string>;
  /** Absent on read-only pages, which hides the checkboxes. */
  onToggle?: (id: string) => void;
  onUnselectAll?: () => void;
  onReset?: () => void;
}

const SUMMARY_COLUMNS: ReportColumn<ConversionRow>[] = [
  {
    id: 'averageRate',
    header: 'Avg rate',
    value: (row) => row.averageRate,
    format: 'percent',
    width: 150,
    render: (row, formatted) => (
      <AverageRateCell formatted={formatted} row={row} />
    ),
  },
  { id: 'total', header: 'Total', value: (row) => row.total },
  { id: 'conversions', header: 'Conversions', value: (row) => row.conversions },
];

const IDENTITY: ReportRowIdentity<ConversionRow> = {
  header: 'Series',
  render: (row) => (
    <span className="flex items-center gap-1.5">
      <SerieIcon name={row.names} />
      <SerieName name={row.names} />
    </span>
  ),
  searchText: (row) => row.names.join(' › '),
  color: (row) => row.color,
};

export function ConversionTable({
  data,
  visibleIds,
  onToggle,
  onUnselectAll,
  onReset,
}: Props) {
  const {
    report: { interval, name },
  } = useReportChartContext();
  const formatDate = useFormatDateInterval({ interval, short: true });

  const dates = useMemo(
    () => data.current[0]?.data.map((item) => item.date) ?? [],
    [data.current]
  );
  const rows = useMemo(
    () =>
      data.current.map((serie, index): ConversionRow => {
        const previous = data.previous?.find((item) => item.id === serie.id);
        return {
          id: serie.id,
          names:
            serie.breakdowns.length > 0 ? serie.breakdowns : ['Conversion'],
          color: getChartColor(index),
          averageRate: average(
            serie.data.map((item) => item.rate),
            true
          ),
          previousAverageRate: previous?.data.length
            ? average(
                previous.data.map((item) => item.rate),
                true
              )
            : undefined,
          total: serie.data.reduce((sum, item) => sum + item.total, 0),
          conversions: serie.data.reduce(
            (sum, item) => sum + item.conversions,
            0
          ),
          rateByDate: Object.fromEntries(
            serie.data.map((item) => [item.date, item.rate])
          ),
        };
      }),
    [data]
  );
  const columns = useMemo<ReportColumn<ConversionRow>[]>(
    () => [
      ...SUMMARY_COLUMNS,
      ...dates.map(
        (date): ReportColumn<ConversionRow> => ({
          id: date,
          header: formatDate(date),
          value: (row) => row.rateByDate[date] ?? 0,
          format: 'percent',
          decorate: 'heat',
        })
      ),
    ],
    [dates, formatDate]
  );

  return (
    <ReportDataTable
      columns={columns}
      csvFilename={name || 'conversion'}
      getRowId={(row) => row.id}
      identity={IDENTITY}
      onReset={onReset}
      onToggleRow={onToggle}
      onUnselectAll={onUnselectAll}
      rows={rows}
      selectedIds={visibleIds}
    />
  );
}

function AverageRateCell({
  row,
  formatted,
}: {
  row: ConversionRow;
  formatted: string;
}) {
  const diff =
    row.previousAverageRate === undefined
      ? null
      : getPreviousMetric(row.averageRate, row.previousAverageRate);
  return (
    <span className="flex items-center justify-end gap-2">
      {formatted}
      {diff && <PreviousDiffIndicatorPure {...diff} size="xs" />}
    </span>
  );
}
