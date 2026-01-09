import { useTRPC } from '@/integrations/trpc/react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { cn } from '@/utils/cn';
import { AspectContainer } from '../aspect-container';
import { ReportChartEmpty } from '../common/empty';
import { ReportChartError } from '../common/error';
import { useReportChartContext } from '../context';
import { Chart } from './chart';

export function ReportBarChart() {
  const { isLazyLoading, report, shareId, shareType } = useReportChartContext();
  const trpc = useTRPC();
  const { range, startDate, endDate, interval } = useOverviewOptions();

  const res = useQuery(
    shareId && shareType && 'id' in report && report.id
      ? trpc.chart.aggregateByReport.queryOptions(
          {
            reportId: report.id,
            shareId,
            shareType,
            range: range ?? undefined,
            startDate: startDate ?? undefined,
            endDate: endDate ?? undefined,
            interval: interval ?? undefined,
          },
          {
            placeholderData: keepPreviousData,
            staleTime: 1000 * 60 * 1,
            enabled: !isLazyLoading,
          },
        )
      : trpc.chart.aggregate.queryOptions(report, {
          placeholderData: keepPreviousData,
          staleTime: 1000 * 60 * 1,
          enabled: !isLazyLoading,
        }),
  );

  if (
    isLazyLoading ||
    res.isLoading ||
    (res.isFetching && !res.data?.series.length)
  ) {
    return <Loading />;
  }
  if (res.isError) {
    return <Error />;
  }

  if (!res.data || res.data?.series.length === 0) {
    return <Empty />;
  }

  return <Chart data={res.data} />;
}

function Loading() {
  const { isEditMode } = useReportChartContext();
  return (
    <div className={cn('w-full', isEditMode && 'card')}>
      <div className="overflow-hidden">
        <div className="divide-y divide-def-200 dark:divide-def-800">
          {Array.from({ length: 10 }).map((_, index) => (
            <div
              key={index as number}
              className="relative px-4 py-3 animate-pulse"
            >
              <div className="relative z-10 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    {/* Icon skeleton */}
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-def-100 dark:border-def-800 dark:bg-def-900" />

                    <div className="min-w-0">
                      {/* Rank badge skeleton */}
                      <div className="mb-1 flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-def-200 dark:bg-def-700" />
                        <div className="h-2 w-12 rounded bg-def-200 dark:bg-def-700" />
                      </div>

                      {/* Name skeleton */}
                      <div
                        className="h-4 rounded bg-def-200 dark:bg-def-700"
                        style={{
                          width: `${Math.random() * 100 + 100}px`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Count skeleton */}
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <div className="h-5 w-16 rounded bg-def-200 dark:bg-def-700" />
                  </div>
                </div>

                {/* Bar skeleton */}
                <div className="flex items-center">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-def-100 dark:bg-def-900">
                    <div
                      className="h-full rounded-full bg-def-200 dark:bg-def-700"
                      style={{
                        width: `${Math.random() * 60 + 20}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
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
