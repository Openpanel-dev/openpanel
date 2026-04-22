import { changeVisibleSeries } from '@/components/report/reportSlice';
import { useTRPC } from '@/integrations/trpc/react';
import { useDispatch } from '@/redux';
import type { RouterOutputs } from '@/trpc/client';
import { useQuery } from '@tanstack/react-query';

import { AspectContainer } from '../aspect-container';
import { ReportChartEmpty } from '../common/empty';
import { ReportChartError } from '../common/error';
import { ReportChartLoading } from '../common/loading';
import { useChartInput, useReportChartContext } from '../context';
import { useVisibleFunnelBreakdowns } from '@/hooks/use-visible-funnel-breakdowns';
import { Chart, Summary } from './chart';
import { BreakdownList } from './breakdown-list';

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
      },
    ),
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

  const hasBreakdowns = res.data.current.length > 1;

  return (
    <div className="col gap-4">
      {hasBreakdowns && <Summary data={res.data} />}
      <Chart data={res.data} visibleBreakdowns={visibleBreakdowns} />
      <BreakdownList
        data={res.data}
        visibleSeriesIds={visibleBreakdowns.map((b) => b.id)}
        setVisibleSeries={setVisibleSeries}
      />
    </div>
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
