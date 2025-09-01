import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';

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
      events,
      range,
      projectId,
      startDate,
      endDate,
      criteria,
      interval,
    },
    isLazyLoading,
  } = useReportChartContext();
  const firstEvent = (events[0]?.filters[0]?.value ?? []).map(String);
  const secondEvent = (events[1]?.filters[0]?.value ?? []).map(String);
  const isEnabled =
    firstEvent.length > 0 && secondEvent.length > 0 && !isLazyLoading;
  const trpc = useTRPC();
  const res = useQuery(
    trpc.chart.cohort.queryOptions(
      {
        firstEvent,
        secondEvent,
        projectId,
        range,
        startDate,
        endDate,
        criteria,
        interval,
      },
      {
        keepPreviousData: true,
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

  if (res.data.length === 0) {
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
