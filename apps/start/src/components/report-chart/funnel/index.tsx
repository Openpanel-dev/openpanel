import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/trpc/client';
import { useQuery } from '@tanstack/react-query';

import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import type { IChartInput } from '@openpanel/validation';

import { AspectContainer } from '../aspect-container';
import { ReportChartEmpty } from '../common/empty';
import { ReportChartError } from '../common/error';
import { ReportChartLoading } from '../common/loading';
import { useReportChartContext } from '../context';
import { Chart, Summary, Tables } from './chart';

export function ReportFunnelChart() {
  const {
    report: {
      id,
      series,
      range,
      projectId,
      funnelWindow,
      funnelGroup,
      startDate,
      endDate,
      previous,
      breakdowns,
    },
    isLazyLoading,
    shareId,
    shareType,
  } = useReportChartContext();
  const { range: overviewRange, startDate: overviewStartDate, endDate: overviewEndDate, interval: overviewInterval } = useOverviewOptions();

  const trpc = useTRPC();
  const res = useQuery(
    shareId && shareType && id
      ? trpc.chart.funnelByReport.queryOptions(
          {
            reportId: id,
            shareId,
            shareType,
            range: overviewRange ?? undefined,
            startDate: overviewStartDate ?? undefined,
            endDate: overviewEndDate ?? undefined,
            interval: overviewInterval ?? undefined,
          },
          {
            enabled: !isLazyLoading && series.length > 0,
          },
        )
      : (() => {
          const input: IChartInput = {
            series,
            range,
            projectId,
            interval: 'day',
            chartType: 'funnel',
            breakdowns,
            funnelWindow,
            funnelGroup,
            previous,
            metric: 'sum',
            startDate,
            endDate,
            limit: 20,
          };
          return trpc.chart.funnel.queryOptions(input, {
            enabled: !isLazyLoading && input.series.length > 0,
          });
        })(),
  );

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
    <div className="col gap-4">
      {res.data.current.length > 1 && <Summary data={res.data} />}
      <Chart data={res.data} />
      {res.data.current.map((item, index) => (
        <Tables
          key={item.id}
          data={{
            current: item,
            previous: res.data.previous?.[index] ?? null,
          }}
        />
      ))}
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
