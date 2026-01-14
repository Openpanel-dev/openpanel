import { useTRPC } from '@/integrations/trpc/react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { AspectContainer } from '../aspect-container';
import { ReportChartEmpty } from '../common/empty';
import { ReportChartError } from '../common/error';
import { ReportChartLoading } from '../common/loading';
import { useReportChartContext } from '../context';
import { Chart } from './chart';
import CohortTable from './table';

export function ReportRetentionChart() {
  const {
    report: {
      id,
      series,
      range,
      projectId,
      options,
      startDate,
      endDate,
      interval,
    },
    isLazyLoading,
    shareId,
  } = useReportChartContext();
  const {
    range: overviewRange,
    startDate: overviewStartDate,
    endDate: overviewEndDate,
    interval: overviewInterval,
  } = useOverviewOptions();
  const eventSeries = series.filter((item) => item.type === 'event');
  const firstEvent = (eventSeries[0]?.filters?.[0]?.value ?? []).map(String);
  const secondEvent = (eventSeries[1]?.filters?.[0]?.value ?? []).map(String);
  const isEnabled =
    firstEvent.length > 0 && secondEvent.length > 0 && !isLazyLoading;

  const retentionOptions = options?.type === 'retention' ? options : undefined;
  const criteria = retentionOptions?.criteria ?? 'on_or_after';

  const trpc = useTRPC();
  const res = useQuery(
    trpc.chart.cohort.queryOptions(
      {
        firstEvent,
        secondEvent,
        projectId,
        range: overviewRange ?? range,
        startDate: overviewStartDate ?? startDate,
        endDate: overviewEndDate ?? endDate,
        criteria,
        interval: overviewInterval ?? interval,
        shareId,
        reportId: id,
      },
      {
        placeholderData: keepPreviousData,
        staleTime: 1000 * 60 * 1,
        enabled: isEnabled,
      },
    ),
  );

  if (!isEnabled) {
    return <Disabled />;
  }

  if (isLazyLoading || res.isLoading) {
    return <Loading />;
  }

  if (res.isError) {
    return <Error />;
  }

  if (!res.data || res.data?.length === 0) {
    return <Empty />;
  }

  return (
    <div className="col gap-4">
      <AspectContainer>
        <Chart data={res.data} />
      </AspectContainer>
      <CohortTable data={res.data} />
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

function Disabled() {
  return (
    <AspectContainer>
      <ReportChartEmpty title="Select 2 events">
        We need two events to determine the retention rate.
      </ReportChartEmpty>
    </AspectContainer>
  );
}
