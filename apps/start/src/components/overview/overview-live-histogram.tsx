import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';
import { useQuery } from '@tanstack/react-query';

import type { IChartProps } from '@openpanel/validation';

import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

interface OverviewLiveHistogramProps {
  projectId: string;
}

export function OverviewLiveHistogram({
  projectId,
}: OverviewLiveHistogramProps) {
  const report: IChartProps = {
    projectId,
    events: [
      {
        segment: 'user',
        filters: [
          {
            id: '1',
            name: 'name',
            operator: 'is',
            value: ['screen_view', 'session_start'],
          },
        ],
        id: 'A',
        name: '*',
        displayName: 'Active users',
      },
    ],
    chartType: 'histogram',
    interval: 'minute',
    range: '30min',
    name: '',
    metric: 'sum',
    breakdowns: [],
    lineType: 'monotone',
    previous: false,
  };
  const countReport: IChartProps = {
    name: '',
    projectId,
    events: [
      {
        segment: 'user',
        filters: [],
        id: 'A',
        name: 'session_start',
      },
    ],
    breakdowns: [],
    chartType: 'metric',
    lineType: 'monotone',
    interval: 'minute',
    range: '30min',
    previous: false,
    metric: 'sum',
  };
  const trpc = useTRPC();

  const res = useQuery(trpc.chart.chart.queryOptions(report));
  const countRes = useQuery(trpc.chart.chart.queryOptions(countReport));

  const metrics = res.data?.series[0]?.metrics;
  const minutes = (res.data?.series[0]?.data || []).slice(-30);
  const liveCount = countRes.data?.series[0]?.metrics?.sum ?? 0;

  if (res.isInitialLoading || countRes.isInitialLoading) {
    const staticArray = [
      10, 25, 30, 45, 20, 5, 55, 18, 40, 12, 50, 35, 8, 22, 38, 42, 15, 28, 52,
      5, 48, 14, 32, 58, 7, 19, 33, 56, 24, 5,
    ];

    return (
      <Wrapper count={0}>
        {staticArray.map((percent, i) => (
          <div
            key={i as number}
            className="flex-1 animate-pulse rounded-t-sm bg-def-200"
            style={{ height: `${percent}%` }}
          />
        ))}
      </Wrapper>
    );
  }

  if (!res.isSuccess && !countRes.isSuccess) {
    return null;
  }

  return (
    <Wrapper count={liveCount}>
      {minutes.map((minute) => {
        return (
          <Tooltip key={minute.date}>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'flex-1 rounded-t-sm transition-all ease-in-out hover:scale-110',
                  minute.count === 0 ? 'bg-def-200' : 'bg-highlight',
                )}
                style={{
                  height:
                    minute.count === 0
                      ? '5%'
                      : `${(minute.count / metrics!.max) * 100}%`,
                }}
              />
            </TooltipTrigger>
            <TooltipContent side="top">
              <div>{minute.count} active users</div>
              <div>@ {new Date(minute.date).toLocaleTimeString()}</div>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </Wrapper>
  );
}

interface WrapperProps {
  children: React.ReactNode;
  count: number;
}

function Wrapper({ children, count }: WrapperProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="relative mb-1 text-sm font-medium text-muted-foreground">
        {count} unique vistors last 30 minutes
      </div>
      <div className="relative flex h-full w-full flex-1 items-end gap-1">
        {children}
      </div>
    </div>
  );
}
