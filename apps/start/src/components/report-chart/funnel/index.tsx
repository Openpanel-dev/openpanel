import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/trpc/client';
import { useQuery } from '@tanstack/react-query';

import { AspectContainer } from '../aspect-container';
import { ReportChartEmpty } from '../common/empty';
import { ReportChartError } from '../common/error';
import { ReportChartLoading } from '../common/loading';
import { useReportChartContext } from '../context';
import { Chart, Summary, Tables } from './chart';

export function ReportFunnelChart() {
  const { isLazyLoading, report, shareId } = useReportChartContext();
  const trpc = useTRPC();
  const res = useQuery(
    trpc.chart.funnel.queryOptions(
      {
        ...report,
        shareId,
      },
      {
        enabled: !isLazyLoading && report.series.length > 0,
      },
    ),
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
