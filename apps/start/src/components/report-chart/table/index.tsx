import {
  changeTableColumnAlias,
  changeTableColumnVisibility,
  changeTableDateMode,
  changeVisibleSeries,
} from '@/components/report/reportSlice';
import { useVisibleSeries } from '@/hooks/use-visible-series';
import { useTRPC } from '@/integrations/trpc/react';
import { useDispatch } from '@/redux';
import type { IChartData } from '@/trpc/client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { ReportChartEmpty } from '../common/empty';
import { ReportChartError } from '../common/error';
import { ReportChartLoading } from '../common/loading';
import { ReportTable } from '../common/report-table';
import { useChartInput, useReportChartContext } from '../context';

export function ReportTableChart() {
  const { isLazyLoading, isEditMode, report, shareId } =
    useReportChartContext();
  const chartInput = useChartInput();
  const dispatch = useDispatch();
  const trpc = useTRPC();

  const res = useQuery(
    trpc.chart.chart.queryOptions(
      {
        ...chartInput,
        shareId,
      },
      {
        placeholderData: keepPreviousData,
        enabled: !isLazyLoading,
      },
    ),
  );

  if (
    isLazyLoading ||
    res.isLoading ||
    (res.isFetching && !res.data?.series.length)
  ) {
    return <ReportChartLoading />;
  }

  if (res.isError) {
    return <ReportChartError />;
  }

  if (!res.data || res.data.series.length === 0) {
    return <ReportChartEmpty />;
  }

  const tableOptions = report.options?.type === 'table' ? report.options : null;

  return (
    <Table
      data={res.data}
      isEditMode={isEditMode}
      columnAliases={tableOptions?.columnAliases ?? {}}
      hiddenColumnKeys={tableOptions?.hiddenColumns ?? []}
      dateMode={tableOptions?.dateMode ?? 'columns'}
      savedVisibleSeries={report.visibleSeries}
      onColumnAliasChange={(key, alias) =>
        dispatch(changeTableColumnAlias({ key, alias }))
      }
      onColumnVisibilityChange={(key, visible) =>
        dispatch(changeTableColumnVisibility({ key, visible }))
      }
      onDateModeChange={(dateMode) => dispatch(changeTableDateMode(dateMode))}
      onVisibleSeriesChange={(ids) => dispatch(changeVisibleSeries(ids))}
    />
  );
}

function Table({
  data,
  isEditMode,
  columnAliases,
  hiddenColumnKeys,
  dateMode,
  savedVisibleSeries,
  onColumnAliasChange,
  onColumnVisibilityChange,
  onDateModeChange,
  onVisibleSeriesChange,
}: {
  data: IChartData;
  isEditMode: boolean;
  columnAliases: Record<string, string>;
  hiddenColumnKeys: string[];
  dateMode: 'columns' | 'aggregate';
  savedVisibleSeries?: string[] | null;
  onColumnAliasChange: (key: string, alias: string) => void;
  onColumnVisibilityChange: (key: string, visible: boolean) => void;
  onDateModeChange: (dateMode: 'columns' | 'aggregate') => void;
  onVisibleSeriesChange: (ids: string[]) => void;
}) {
  const { series, setVisibleSeries } = useVisibleSeries(data, {
    limit: data.series.length,
    savedVisibleSeries,
    onVisibleSeriesChange: isEditMode ? onVisibleSeriesChange : undefined,
  });

  return (
    <ReportTable
      className="mt-0"
      data={data}
      visibleSeries={series}
      setVisibleSeries={setVisibleSeries}
      columnAliases={columnAliases}
      hiddenColumnKeys={hiddenColumnKeys}
      dateMode={dateMode}
      onColumnAliasChange={isEditMode ? onColumnAliasChange : undefined}
      onColumnVisibilityChange={
        isEditMode ? onColumnVisibilityChange : undefined
      }
      onDateModeChange={isEditMode ? onDateModeChange : undefined}
    />
  );
}


