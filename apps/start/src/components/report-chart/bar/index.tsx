import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AspectContainer } from '../aspect-container';
import { ReportChartEmpty } from '../common/empty';
import { ReportChartError } from '../common/error';
import { useChartInput, useReportChartContext } from '../context';
import { Chart, ROW_HEIGHT } from './chart';
import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';

// Fixed, not random: the server and the browser must render the same widths.
const SKELETON_NAME_WIDTHS = [62, 48, 56, 40, 60, 44, 66, 52, 38, 58];
const SKELETON_BAR_WIDTHS = [72, 48, 63, 35, 57, 41, 78, 52, 29, 66];
const SKELETON_ROWS = 10;

export function ReportBarChart() {
  const { isLazyLoading, shareId } = useReportChartContext();
  const chartInput = useChartInput();
  const trpc = useTRPC();

  const res = useQuery(
    trpc.chart.aggregate.queryOptions(
      {
        ...chartInput,
        shareId,
      },
      {
        placeholderData: keepPreviousData,
        enabled: !isLazyLoading,
      }
    )
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
  const { isEditMode, layout } = useReportChartContext();
  return (
    <div
      className={cn(
        'col w-full overflow-hidden',
        isEditMode && 'card p-4',
        layout === 'fill' && 'h-full'
      )}
    >
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <div
          className="flex shrink-0 animate-pulse items-center gap-3"
          key={SKELETON_BAR_WIDTHS[index]}
          style={{ height: ROW_HEIGHT }}
        >
          <div className="flex w-2/5 items-center gap-2">
            <div className="size-4 rounded-full bg-def-200 dark:bg-def-700" />
            <div
              className="h-3 rounded bg-def-200 dark:bg-def-700"
              style={{ width: `${SKELETON_NAME_WIDTHS[index]}%` }}
            />
          </div>
          <div className="flex-1">
            <div
              className="h-4 rounded bg-def-100 dark:bg-def-800"
              style={{ width: `${SKELETON_BAR_WIDTHS[index]}%` }}
            />
          </div>
        </div>
      ))}
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
