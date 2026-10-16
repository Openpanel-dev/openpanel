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
import type { RouterOutputs } from '@/trpc/client';
import { getChartColor } from '@/utils/theme';

type FunnelData = RouterOutputs['chart']['funnel'];
type Funnel = FunnelData['current'][number];

interface BreakdownRow {
  id: string;
  funnel: Funnel;
  previous: Funnel | null;
  color: string;
}

interface Props {
  data: FunnelData;
  visibleIds: ReadonlySet<string>;
  onToggle?: (id: string) => void;
  onUnselectAll?: () => void;
  /** The breakdown whose steps are shown under the table. */
  activeId?: string;
  onSelect: (id: string) => void;
}

const IDENTITY: ReportRowIdentity<BreakdownRow> = {
  header: 'Breakdown',
  render: (row) => (
    <span className="flex items-center gap-1.5">
      <SerieIcon name={row.funnel.breakdowns} />
      <SerieName name={row.funnel.breakdowns} />
    </span>
  ),
  searchText: (row) => row.funnel.breakdowns.join(' › '),
  color: (row) => row.color,
};

/** One row per breakdown: its conversion, how many completed, and how far along each step got. */
export function BreakdownTable({
  data,
  visibleIds,
  onToggle,
  onUnselectAll,
  activeId,
  onSelect,
}: Props) {
  const {
    report: { name },
  } = useReportChartContext();
  const rows = useMemo(
    () =>
      data.current.map(
        (funnel, index): BreakdownRow => ({
          id: funnel.id,
          funnel,
          previous: data.previous?.[index] ?? null,
          color: getChartColor(index),
        })
      ),
    [data]
  );
  const steps = data.current[0]?.steps ?? [];

  const columns = useMemo<ReportColumn<BreakdownRow>[]>(
    () => [
      {
        id: 'conversion',
        header: 'Conversion',
        value: (row) => row.funnel.lastStep.percent,
        format: 'percent',
        decorate: 'bar',
        width: 150,
        render: (row, formatted) => (
          <span className="flex items-center justify-end gap-2">
            {formatted}
            {row.previous && (
              <PreviousDiffIndicatorPure
                {...getPreviousMetric(
                  row.funnel.lastStep.percent,
                  row.previous.lastStep.percent
                )}
                size="xs"
              />
            )}
          </span>
        ),
      },
      {
        id: 'completed',
        header: 'Completed',
        value: (row) => row.funnel.lastStep.count,
      },
      {
        id: 'dropoff',
        header: 'Most drop-off after',
        value: (row) => row.funnel.mostDropoffsStep?.event.displayName ?? '',
        format: 'text',
        width: 180,
      },
      ...steps.map(
        (step, index): ReportColumn<BreakdownRow> => ({
          id: `step:${index}`,
          header: step.event.displayName,
          value: (row) => row.funnel.steps[index]?.percent ?? 0,
          format: 'percent',
          decorate: 'heat',
          width: 150,
        })
      ),
    ],
    [steps]
  );

  return (
    <ReportDataTable
      activeId={activeId}
      columns={columns}
      csvFilename={name || 'funnel'}
      getRowId={(row) => row.id}
      identity={IDENTITY}
      onRowClick={onSelect}
      onToggleRow={onToggle}
      onUnselectAll={onUnselectAll}
      rows={rows}
      selectedIds={visibleIds}
    />
  );
}
