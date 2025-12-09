import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';

import { useNumber } from '@/hooks/use-numer-formatter';
import { getChartColor } from '@/utils/theme';
import * as Portal from '@radix-ui/react-portal';
import { bind } from 'bind-event-listener';
import throttle from 'lodash.throttle';
import React, { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AnimatedNumber } from '../animated-number';
import { BarShapeBlue } from '../charts/common-bar';
import { SerieIcon } from '../report-chart/common/serie-icon';

interface RealtimeLiveHistogramProps {
  projectId: string;
}

export function RealtimeLiveHistogram({
  projectId,
}: RealtimeLiveHistogramProps) {
  const trpc = useTRPC();

  // Use the same liveData endpoint as overview
  const { data: liveData, isLoading } = useQuery(
    trpc.overview.liveData.queryOptions({ projectId }),
  );

  const chartData = liveData?.minuteCounts ?? [];
  // Calculate total unique visitors (sum of unique visitors per minute)
  // Note: This is an approximation - ideally we'd want unique visitors across all minutes
  const totalVisitors = liveData?.totalSessions ?? 0;

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
    Math.max(...chartData.map((item) => item.visitorCount), 0) * 1.2 || 1;

  return (
    <Wrapper
      count={totalVisitors}
      icons={
        liveData.referrers && liveData.referrers.length > 0 ? (
          <div className="row gap-2 shrink-0">
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
        ) : null
      }
    >
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
            dataKey="visitorCount"
            fill="rgba(59, 121, 255, 0.2)"
            isAnimationActive={false}
            shape={BarShapeBlue}
            activeBar={BarShapeBlue}
          />
        </BarChart>
      </ResponsiveContainer>
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
    <div className="flex flex-col">
      <div className="row gap-2 justify-between mb-2">
        <div className="relative text-sm font-medium text-muted-foreground leading-normal">
          Unique visitors {icons ? <br /> : null}
          last 30 min
        </div>
        <div>{icons}</div>
      </div>
      <div className="col gap-2 mb-4">
        <div className="font-mono text-6xl font-bold">
          <AnimatedNumber value={count} />
        </div>
      </div>
      <div className="relative aspect-[6/1] w-full">{children}</div>
    </div>
  );
}

// Custom tooltip component that uses portals to escape overflow hidden
const CustomTooltip = ({ active, payload, coordinate }: any) => {
  const number = useNumber();
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null,
  );

  const inactive = !active || !payload?.length;
  useEffect(() => {
    const setPositionThrottled = throttle(setPosition, 50);
    const unsubMouseMove = bind(window, {
      type: 'mousemove',
      listener(event) {
        if (!inactive) {
          setPositionThrottled({ x: event.clientX, y: event.clientY + 20 });
        }
      },
    });
    const unsubDragEnter = bind(window, {
      type: 'pointerdown',
      listener() {
        setPosition(null);
      },
    });

    return () => {
      unsubMouseMove();
      unsubDragEnter();
    };
  }, [inactive]);

  if (inactive) {
    return null;
  }

  if (!active || !payload || !payload.length) {
    return null;
  }

  const data = payload[0].payload;

  const tooltipWidth = 200;
  const correctXPosition = (x: number | undefined) => {
    if (!x) {
      return undefined;
    }

    const screenWidth = window.innerWidth;
    const newX = x;

    if (newX + tooltipWidth > screenWidth) {
      return screenWidth - tooltipWidth;
    }
    return newX;
  };

  return (
    <Portal.Portal
      style={{
        position: 'fixed',
        top: position?.y,
        left: correctXPosition(position?.x),
        zIndex: 1000,
        width: tooltipWidth,
      }}
      className="bg-background/80 p-3 rounded-md border shadow-xl backdrop-blur-sm"
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
            <div className="flex items-center gap-1">Active users</div>
            <div className="flex justify-between gap-8 font-mono font-medium">
              <div className="row gap-1">
                {number.formatWithUnit(data.visitorCount)}
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
    </Portal.Portal>
  );
};
