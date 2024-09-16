'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { api } from '@/trpc/client';
import { cn } from '@/utils/cn';
import dynamic from 'next/dynamic';

import type { IChartProps } from '@openpanel/validation';

interface RealtimeLiveHistogramProps {
  projectId: string;
}

export function RealtimeLiveHistogram({
  projectId,
}: RealtimeLiveHistogramProps) {
  const report: IChartProps = {
    projectId,
    events: [
      {
        segment: 'user',
        filters: [
          {
            name: 'name',
            operator: 'is',
            value: ['screen_view', 'session_start'],
          },
        ],
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

  const res = api.chart.chart.useQuery(report);
  const countRes = api.chart.chart.useQuery(countReport);

  const metrics = res.data?.series[0]?.metrics;
  const minutes = (res.data?.series[0]?.data || []).slice(-30);
  const liveCount = countRes.data?.series[0]?.metrics?.sum ?? 0;

  if (res.isInitialLoading || countRes.isInitialLoading || liveCount === 0) {
    const staticArray = [
      10, 25, 30, 45, 20, 5, 55, 18, 40, 12, 50, 35, 8, 22, 38, 42, 15, 28, 52,
      5, 48, 14, 32, 58, 7, 19, 33, 56, 24, 5,
    ];

    return (
      <Wrapper count={0}>
        {staticArray.map((percent, i) => (
          <div
            key={i as number}
            className="flex-1 animate-pulse rounded bg-def-200"
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
                  'flex-1 rounded transition-all ease-in-out hover:scale-110',
                  minute.count === 0 ? 'bg-def-200' : 'bg-highlight',
                )}
                style={{
                  height:
                    minute.count === 0
                      ? '20%'
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

const AnimatedNumbers = dynamic(() => import('react-animated-numbers'), {
  ssr: false,
  loading: () => <div>0</div>,
});

function Wrapper({ children, count }: WrapperProps) {
  return (
    <div className="flex flex-col">
      <div className="col gap-2 p-4">
        <div className="font-medium text-muted-foreground">
          Unique vistors last 30 minutes
        </div>
        <div className="font-mono text-6xl font-bold">
          <AnimatedNumbers
            includeComma
            transitions={(index) => ({
              type: 'spring',
              duration: index + 0.3,
              damping: 10,
              stiffness: 200,
            })}
            animateToNumber={count}
            locale="en"
          />
        </div>
      </div>
      <div className="relative flex aspect-[6/1] w-full flex-1 items-end gap-0.5">
        {children}
      </div>
    </div>
  );
}
