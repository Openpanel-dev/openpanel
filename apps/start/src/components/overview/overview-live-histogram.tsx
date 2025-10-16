import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';
import { useQuery } from '@tanstack/react-query';

import type { IChartProps } from '@openpanel/validation';

import { useNumber } from '@/hooks/use-numer-formatter';
import { getChartColor } from '@/utils/theme';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Customized,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarShapeBlue } from '../charts/common-bar';

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

  // Transform data for Recharts
  const chartData = minutes.map((minute) => ({
    ...minute,
    timestamp: new Date(minute.date).getTime(),
    time: new Date(minute.date).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    }),
  }));

  if (res.isInitialLoading || countRes.isInitialLoading) {
    return (
      <Wrapper count={0}>
        <div className="h-full w-full animate-pulse bg-def-200 rounded" />
      </Wrapper>
    );
  }

  if (!res.isSuccess && !countRes.isSuccess) {
    return null;
  }

  return (
    <Wrapper count={liveCount}>
      <div className="h-full w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
          >
            <Tooltip
              content={CustomTooltip}
              cursor={{
                fill: 'var(--def-200)',
              }}
            />
            <XAxis dataKey="time" axisLine={false} tickLine={false} hide />
            <YAxis hide />
            <Bar
              dataKey="count"
              fill="rgba(59, 121, 255, 0.2)"
              isAnimationActive={false}
              shape={BarShapeBlue}
              activeBar={BarShapeBlue}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
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
      <div className="relative flex h-full w-full flex-1 items-end justify-center gap-2">
        {children}
      </div>
    </div>
  );
}

// Custom tooltip component that uses portals to escape overflow hidden
const CustomTooltip = ({ active, payload, coordinate }: any) => {
  const [tooltipContainer] = useState(() => document.createElement('div'));
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const number = useNumber();

  useEffect(() => {
    document.body.appendChild(tooltipContainer);

    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };

    document.addEventListener('mousemove', handleMouseMove);

    return () => {
      if (document.body.contains(tooltipContainer)) {
        document.body.removeChild(tooltipContainer);
      }
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [tooltipContainer]);

  if (!active || !payload || !payload.length) {
    return null;
  }

  const data = payload[0].payload;

  // Smart positioning to avoid going out of bounds
  const tooltipWidth = 180; // min-w-[180px]
  const tooltipHeight = 80; // approximate height
  const offset = 10;

  let left = mousePosition.x + offset;
  let top = mousePosition.y - offset;

  // Check if tooltip would go off the right edge
  if (left + tooltipWidth > window.innerWidth) {
    left = mousePosition.x - tooltipWidth - offset;
  }

  // Check if tooltip would go off the left edge
  if (left < 0) {
    left = offset;
  }

  // Check if tooltip would go off the top edge
  if (top < 0) {
    top = mousePosition.y + offset;
  }

  // Check if tooltip would go off the bottom edge
  if (top + tooltipHeight > window.innerHeight) {
    top = window.innerHeight - tooltipHeight - offset;
  }

  const tooltipContent = (
    <div
      className="flex min-w-[180px] flex-col gap-2 rounded-xl border bg-background/80 p-3 shadow-xl backdrop-blur-sm"
      style={{
        position: 'fixed',
        top,
        left,
        pointerEvents: 'none',
        zIndex: 1000,
      }}
    >
      <div className="flex justify-between gap-8 text-muted-foreground">
        <div>
          {new Date(data.date).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>
      <React.Fragment>
        <div className="flex gap-2">
          <div
            className="w-[3px] rounded-full"
            style={{ background: getChartColor(0) }}
          />
          <div className="col flex-1 gap-1">
            <div className="flex items-center gap-1">Active users</div>
            <div className="flex justify-between gap-8 font-mono font-medium">
              <div className="row gap-1">
                {number.formatWithUnit(data.count)}
              </div>
            </div>
          </div>
        </div>
      </React.Fragment>
    </div>
  );

  return createPortal(tooltipContent, tooltipContainer);
};
