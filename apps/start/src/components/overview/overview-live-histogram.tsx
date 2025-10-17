import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';
import { useQuery } from '@tanstack/react-query';

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
import { SerieIcon } from '../report-chart/common/serie-icon';

interface OverviewLiveHistogramProps {
  projectId: string;
}

export function OverviewLiveHistogram({
  projectId,
}: OverviewLiveHistogramProps) {
  const trpc = useTRPC();

  // Use the new liveData endpoint instead of chart props
  const { data: liveData, isLoading } = useQuery(
    trpc.overview.liveData.queryOptions({ projectId }),
  );

  const totalSessions = liveData?.totalSessions ?? 0;
  const chartData = liveData?.minuteCounts ?? [];

  if (isLoading) {
    return (
      <Wrapper count={0}>
        <div className="h-full w-full animate-pulse bg-def-200 rounded" />
      </Wrapper>
    );
  }

  if (!liveData) {
    return null;
  }

  const maxDomain =
    Math.max(...chartData.map((item) => item.sessionCount)) * 1.2;

  return (
    <Wrapper
      count={totalSessions}
      icons={
        <div className="row gap-2">
          {liveData.referrers.slice(0, 3).map((ref, index) => (
            <div
              key={`${ref.referrer}-${ref.count}-${index}`}
              className="font-bold text-xs row gap-1 items-center"
            >
              <SerieIcon name={ref.referrer} />
              <span>{ref.count}</span>
            </div>
          ))}
        </div>
      }
    >
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
            <YAxis hide domain={[0, maxDomain]} />
            <Bar
              dataKey="sessionCount"
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
  icons?: React.ReactNode;
}

function Wrapper({ children, count, icons }: WrapperProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="row gap-2 justify-between">
        <div className="relative mb-1 text-sm font-medium text-muted-foreground">
          {count} sessions last 30 minutes
        </div>
        <div>{icons}</div>
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
  const tooltipWidth = 220; // min-w-[220px] to accommodate referrers
  const tooltipHeight = 120; // approximate height with referrers
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
      className="flex min-w-[220px] flex-col gap-2 rounded-xl border bg-background/80 p-3 shadow-xl backdrop-blur-sm"
      style={{
        position: 'fixed',
        top,
        left,
        pointerEvents: 'none',
        zIndex: 1000,
      }}
    >
      <div className="flex justify-between gap-8 text-muted-foreground">
        <div>{data.time}</div>
      </div>
      <React.Fragment>
        <div className="flex gap-2">
          <div
            className="w-[3px] rounded-full"
            style={{ background: getChartColor(0) }}
          />
          <div className="col flex-1 gap-1">
            <div className="flex items-center gap-1">Sessions</div>
            <div className="flex justify-between gap-8 font-mono font-medium">
              <div className="row gap-1">
                {number.formatWithUnit(data.sessionCount)}
              </div>
            </div>
          </div>
        </div>
        {data.referrers && data.referrers.length > 0 && (
          <div className="mt-2 pt-2 border-t border-border">
            <div className="text-xs text-muted-foreground mb-2">Referrers:</div>
            <div className="space-y-1">
              {data.referrers.slice(0, 3).map((ref: any, index: number) => (
                <div
                  key={`${ref.referrer}-${ref.count}-${index}`}
                  className="row items-center justify-between text-xs"
                >
                  <div className="row items-center gap-1">
                    <SerieIcon name={ref.referrer} />
                    <span
                      className="truncate max-w-[120px]"
                      title={ref.referrer}
                    >
                      {ref.referrer}
                    </span>
                  </div>
                  <span className="font-mono">{ref.count}</span>
                </div>
              ))}
              {data.referrers.length > 3 && (
                <div className="text-xs text-muted-foreground">
                  +{data.referrers.length - 3} more
                </div>
              )}
            </div>
          </div>
        )}
      </React.Fragment>
    </div>
  );

  return createPortal(tooltipContent, tooltipContainer);
};
