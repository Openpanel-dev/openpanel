import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { AspectContainer } from '../aspect-container';
import { ChartWithTable, TableCard } from '../common/chart-with-table';
import { ReportChartEmpty } from '../common/empty';
import { ReportChartError } from '../common/error';
import { ReportChartLoading } from '../common/loading';
import { useChartInput, useReportChartContext } from '../context';
import { BreakdownTable } from './breakdown-table';
import { Summary } from './chart';
import { Chart } from './steps-chart';
import { StepsTable } from './steps-table';
import { changeVisibleSeries } from '@/components/report/reportSlice';
import { useVisibleFunnelBreakdowns } from '@/hooks/use-visible-funnel-breakdowns';
import { useTRPC } from '@/integrations/trpc/react';
import { useDispatch } from '@/redux';
import type { RouterOutputs } from '@/trpc/client';

export function ReportFunnelChart() {
  const { isLazyLoading, report, shareId, isEditMode } =
    useReportChartContext();
  const chartInput = useChartInput();
  const dispatch = useDispatch();
  const trpc = useTRPC();
  const res = useQuery(
    trpc.chart.funnel.queryOptions(
      {
        ...chartInput,
        shareId,
      },
      {
        enabled: !isLazyLoading && chartInput.series.length > 0,
      }
    )
  );

  // Hook for limiting which breakdowns are shown in the chart only
  const { breakdowns: visibleBreakdowns, setVisibleSeries } =
    useVisibleFunnelBreakdowns(res.data?.current ?? [], {
      limit: 10,
      savedVisibleSeries: report.visibleSeries,
      onVisibleSeriesChange: isEditMode
        ? (ids) => dispatch(changeVisibleSeries(ids))
        : undefined,
    });

  if (isLazyLoading || res.isLoading) {
    return <Loading />;
  }

  if (res.isError) {
    return <Error />;
  }

  if (!res.data || res.data.current.length === 0) {
    return <Empty />;
  }

  return (
    <FunnelWithTables
      data={res.data}
      isEditMode={isEditMode}
      setVisibleSeries={setVisibleSeries}
      visibleBreakdowns={visibleBreakdowns}
    />
  );
}

function FunnelWithTables({
  data,
  isEditMode,
  visibleBreakdowns,
  setVisibleSeries,
}: {
  data: RouterOutputs['chart']['funnel'];
  isEditMode: boolean;
  visibleBreakdowns: RouterOutputs['chart']['funnel']['current'];
  setVisibleSeries: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  const hasBreakdowns = data.current.length > 1;
  const [selectedId, setSelectedId] = useState<string>();
  const visibleIds = useMemo(
    () => new Set(visibleBreakdowns.map((item) => item.id)),
    [visibleBreakdowns]
  );
  const toggle = useCallback(
    (id: string) =>
      setVisibleSeries((ids) =>
        ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]
      ),
    [setVisibleSeries]
  );
  const activeIndex = Math.max(
    0,
    data.current.findIndex((item) => item.id === selectedId)
  );
  const active = data.current[activeIndex];

  return (
    <ChartWithTable
      chart={<Chart data={data} visibleBreakdowns={visibleBreakdowns} />}
      sizesItself
      summary={hasBreakdowns && <Summary data={data} />}
      tables={
        <>
          {hasBreakdowns && (
            <TableCard>
              <BreakdownTable
                activeId={active?.id}
                data={data}
                onSelect={setSelectedId}
                onToggle={isEditMode ? toggle : undefined}
                onUnselectAll={
                  isEditMode ? () => setVisibleSeries([]) : undefined
                }
                visibleIds={visibleIds}
              />
            </TableCard>
          )}
          {active && (
            <TableCard
              title={
                hasBreakdowns && `Steps for ${active.breakdowns.join(' › ')}`
              }
            >
              <StepsTable
                funnel={active}
                previous={data.previous?.[activeIndex] ?? null}
              />
            </TableCard>
          )}
        </>
      }
    />
  );
}

function Loading() {
  return (
    <AspectContainer>
      <ReportChartLoading />
    </AspectContainer>
  );
}

function Error() {
  return (
    <AspectContainer>
      <ReportChartError />
    </AspectContainer>
  );
}

function Empty() {
  return (
    <AspectContainer>
      <ReportChartEmpty />
    </AspectContainer>
  );
}
