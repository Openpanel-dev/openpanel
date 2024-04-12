'use client';

import { api } from '@/trpc/client';
import { cn } from '@/utils/cn';

import type { IChartInput } from '@openpanel/validation';

import AnimateHeight from '../animate-height';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { useOverviewOptions } from './useOverviewOptions';

interface OverviewLiveHistogramProps {
  projectId: string;
}

export function OverviewLiveHistogram({
  projectId,
}: OverviewLiveHistogramProps) {
  const { liveHistogram } = useOverviewOptions();
  const report: IChartInput = {
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
  const countReport: IChartInput = {
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

  const res = api.chart.chart.useQuery(report);
  const countRes = api.chart.chart.useQuery(countReport);

  const metrics = res.data?.series[0]?.metrics;
  const minutes = (res.data?.series[0]?.data || []).slice(-30);
  const liveCount = countRes.data?.series[0]?.metrics?.sum ?? 0;

  if (res.isInitialLoading || countRes.isInitialLoading) {
    // prettier-ignore
    const staticArray = [
      10, 25, 30, 45, 20, 5, 55, 18, 40, 12,
      50, 35, 8, 22, 38, 42, 15, 28, 52, 5,
      48, 14, 32, 58, 7, 19, 33, 56, 24, 5
    ];

    return (
      <Wrapper count={0} open={liveHistogram}>
        {staticArray.map((percent, i) => (
          <div
            key={i}
            className="flex-1 animate-pulse rounded-md bg-slate-200 dark:bg-slate-800"
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
    <Wrapper open={liveHistogram} count={liveCount}>
      {minutes.map((minute) => {
        return (
          <Tooltip key={minute.date}>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'flex-1 rounded-md transition-all ease-in-out hover:scale-110',
                  minute.count === 0 ? 'bg-slate-200' : 'bg-blue-600'
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
  open: boolean;
  children: React.ReactNode;
  count: number;
}

function Wrapper({ open, children, count }: WrapperProps) {
  return (
    <AnimateHeight open={open}>
      <div className="flex flex-col items-end md:flex-row">
        <div className="md:card flex items-end max-md:mb-2 max-md:w-full max-md:justify-between md:mr-2 md:flex-col md:p-4">
          <div className="text-sm max-md:mb-1">Last 30 minutes</div>
          <div className="overflow-hidden text-ellipsis whitespace-nowrap text-2xl font-bold">
            {count}
          </div>
        </div>
        <div className="relative flex aspect-[5/1] max-h-[150px] w-full flex-1 items-end gap-0.5 md:gap-2">
          <div className="absolute -top-3 right-0 text-xs text-muted-foreground">
            NOW
          </div>
          {/* <div className="md:absolute top-0 left-0 md:card md:p-4 mr-2 md:bg-background/90 z-50"> */}
          {children}
        </div>
      </div>
    </AnimateHeight>
  );
}
