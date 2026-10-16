import { useMemo } from 'react';
import { useReportChartContext } from '../context';
import {
  type ReportColumn,
  ReportDataTable,
  type ReportRowIdentity,
} from '@/components/report-table/report-data-table';
import { useNumber } from '@/hooks/use-numer-formatter';
import type { RouterOutputs } from '@/trpc/client';

type CohortRow = RouterOutputs['chart']['cohort'][number];

const COHORT_WIDTH = 170;

const IDENTITY: ReportRowIdentity<CohortRow> = {
  header: 'Cohort',
  render: (row) => row.cohort_interval,
  searchText: (row) => row.cohort_interval,
  width: COHORT_WIDTH,
};

/** One row per cohort: how many profiles it started with and how many came back each period. */
export function CohortTable({ data }: { data: CohortRow[] }) {
  const {
    report: { unit, interval, name },
  } = useReportChartContext();
  const number = useNumber();
  const isPercentage = unit === '%';
  const periodCount = data[0]?.values.length ?? 0;

  const columns = useMemo<ReportColumn<CohortRow>[]>(
    () => [
      {
        id: 'sum',
        header: 'Total profiles',
        value: (row) => row.sum,
        decorate: 'bar',
        width: 130,
      },
      ...Array.from({ length: periodCount }, (_, period) => ({
        id: `period:${period}`,
        header: period === 0 ? `< ${interval} 1` : `${interval} ${period}`,
        value: (row: CohortRow) =>
          (isPercentage ? row.percentages : row.values)[period],
        render: (row: CohortRow, formatted: string) =>
          isPercentage && row.percentages[period] !== undefined
            ? number.formatWithUnit(row.percentages[period], '%')
            : formatted,
        decorate: 'heat' as const,
      })),
    ],
    [periodCount, interval, isPercentage, number]
  );

  return (
    <ReportDataTable
      columns={columns}
      csvFilename={name || 'retention'}
      getRowId={(row) => row.cohort_interval}
      identity={IDENTITY}
      rows={data}
      searchable={false}
    />
  );
}
