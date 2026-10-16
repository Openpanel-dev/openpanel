import { round } from '@openpanel/shared';
import { useCallback, useMemo } from 'react';
import { useReportChartContext } from '../context';
import { getLabelNames } from './label-names';
import { PreviousDiffIndicatorPure } from './previous-diff-indicator';
import { SerieIcon } from './serie-icon';
import { SerieName } from './serie-name';
import {
  type ReportColumn,
  ReportDataTable,
  type ReportRowIdentity,
} from '@/components/report-table/report-data-table';
import { useNumber } from '@/hooks/use-numer-formatter';
import type { IChartData } from '@/trpc/client';
import { getChartColor } from '@/utils/theme';

interface RankedRow {
  id: string;
  names: string[];
  labelNames: string[];
  color: string;
  value: number;
  share: number;
  previous: number | undefined;
  change: { diff: number | null; state: string } | undefined;
}

interface Props {
  data: IChartData;
  visibleIds?: ReadonlySet<string>;
  /** Absent on read-only pages, which hides the checkboxes. */
  onToggle?: (id: string) => void;
  onUnselectAll?: () => void;
}

/** One row per series ranked by its value: the table behind bar and pie reports. */
export function RankedTable({
  data,
  visibleIds,
  onToggle,
  onUnselectAll,
}: Props) {
  const {
    report: { metric, unit, previous: comparesPrevious, name },
  } = useReportChartContext();
  const number = useNumber();
  const formatValue = useCallback(
    (value: number) => number.formatWithUnit(value, unit),
    [number, unit]
  );

  const rows = useMemo(() => {
    const total =
      data.series.reduce(
        (sum, serie) => sum + (serie.metrics[metric] ?? 0),
        0
      ) || 1;
    const labelNames = getLabelNames(data.series);
    return data.series.map((serie, index): RankedRow => {
      const value = serie.metrics[metric] ?? 0;
      const previous = comparesPrevious
        ? serie.metrics.previous?.[metric]
        : undefined;
      return {
        id: serie.id,
        names: serie.names,
        labelNames: labelNames(serie.names),
        color: getChartColor(index),
        value,
        share: round((value / total) * 100, 1),
        previous: comparesPrevious ? (previous?.value ?? 0) : undefined,
        change: previous,
      };
    });
  }, [data.series, metric, comparesPrevious]);

  const identity = useMemo<ReportRowIdentity<RankedRow>>(
    () => ({
      header: 'Series',
      render: (row) => (
        <span className="flex items-center gap-1.5">
          <SerieIcon name={row.labelNames} />
          <SerieName name={row.labelNames} />
        </span>
      ),
      searchText: (row) => row.names.join(' › '),
      color: (row) => row.color,
    }),
    []
  );

  const columns = useMemo<ReportColumn<RankedRow>[]>(
    () => [
      {
        id: 'value',
        header: metric === 'sum' ? 'Value' : metric,
        value: (row) => row.value,
        render: (row) => formatValue(row.value),
        decorate: 'bar',
        width: 160,
      },
      {
        id: 'share',
        header: 'Share',
        value: (row) => row.share,
        format: 'percent',
      },
      ...(comparesPrevious
        ? [
            {
              id: 'previous',
              header: 'Previous',
              value: (row: RankedRow) => row.previous,
              render: (row: RankedRow) => formatValue(row.previous ?? 0),
            },
            {
              id: 'change',
              header: 'Change',
              value: (row: RankedRow) => row.change?.diff ?? null,
              render: (row: RankedRow) =>
                row.change ? (
                  <PreviousDiffIndicatorPure {...row.change} size="xs" />
                ) : null,
            },
          ]
        : []),
    ],
    [metric, comparesPrevious, formatValue]
  );

  return (
    <ReportDataTable
      columns={columns}
      csvFilename={name || 'report'}
      getRowId={(row) => row.id}
      identity={identity}
      onToggleRow={onToggle}
      onUnselectAll={onUnselectAll}
      rows={rows}
      selectedIds={visibleIds}
    />
  );
}
