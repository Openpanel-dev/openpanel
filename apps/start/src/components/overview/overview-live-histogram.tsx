import { useTRPC } from '@/integrations/trpc/react';
import { useNumber } from '@/hooks/use-numer-formatter';
import { cn } from '@/utils/cn';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Bar } from '../charts/bar';
import { BarChart } from '../charts/bar-chart';
import {
  OPStatHoverBridge,
  type OPStatHoverState,
} from '../charts/op-stat-hover-bridge';
import { SerieIcon } from '../report-chart/common/serie-icon';
import { Skeleton } from '../skeleton';
import { MetricCardShell } from './overview-metric-card';

interface OverviewLiveHistogramProps {
  projectId: string;
  shareId?: string;
}

const PRIMARY_COLOR = 'var(--chart-0)';

interface MinutePoint {
  time: string;
  sessionCount: number;
  /** Synthetic per-minute date so bklit's time-based AreaChart can scale the X. */
  date: Date;
  [key: string]: unknown;
}

export function OverviewLiveHistogram({
  projectId,
  shareId,
}: OverviewLiveHistogramProps) {
  const trpc = useTRPC();
  const number = useNumber();

  const { data: liveData, isLoading } = useQuery(
    trpc.overview.liveData.queryOptions({ projectId, shareId }),
  );

  const [hover, setHover] = useState<OPStatHoverState<MinutePoint>>({
    index: null,
    point: null,
  });

  if (isLoading) {
    return (
      <MetricCardShell>
        <div className="px-3 pt-2.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-1 h-6 w-12" />
          <Skeleton className="mt-0.5 h-3 w-32" />
        </div>
        <div className="mt-1.5 h-[40px] animate-pulse bg-def-200/40" />
      </MetricCardShell>
    );
  }

  if (!liveData) {
    return null;
  }

  const rawMinutes = liveData.minuteCounts ?? [];
  const now = Date.now();
  const chartData: MinutePoint[] = rawMinutes.map((point, i) => ({
    ...point,
    date: new Date(now - (rawMinutes.length - 1 - i) * 60_000),
  }));
  const totalSessions = liveData.totalSessions ?? 0;
  const displayCount = hover.point?.sessionCount ?? totalSessions;
  const displayLabel = hover.point ? hover.point.time : 'Last 30 min';
  const referrers = liveData.referrers ?? [];

  return (
    <MetricCardShell>
      <div className="px-3 pt-2.5">
        <div className="flex items-start justify-between gap-2">
          <span className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Live · 30 min
          </span>
          <span className="relative flex h-2 w-2 items-center justify-center">
            <span
              className={cn(
                'absolute inline-flex h-full w-full rounded-full opacity-75',
                totalSessions > 0 ? 'bg-emerald-500 animate-ping' : 'bg-destructive',
              )}
            />
            <span
              className={cn(
                'relative inline-flex h-2 w-2 rounded-full',
                totalSessions > 0 ? 'bg-emerald-500' : 'bg-destructive',
              )}
            />
          </span>
        </div>
        <div className="mt-1 flex items-baseline gap-0.5 leading-none">
          <span className="truncate font-mono font-semibold text-xl text-foreground tracking-tight tabular-nums">
            {number.short(displayCount)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2 truncate text-[11px] leading-none text-muted-foreground">
          <span className="truncate">{displayLabel}</span>
          {referrers.length > 0 && (
            <div className="flex shrink-0 items-center gap-1.5">
              {referrers.slice(0, 3).map((ref, index) => (
                <div
                  key={`${ref.referrer}-${ref.count}-${index}`}
                  className="flex items-center gap-0.5"
                  title={`${ref.referrer} · ${ref.count}`}
                >
                  <SerieIcon name={ref.referrer} />
                  <span className="font-mono tabular-nums">{ref.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-1.5 h-[40px]">
        {chartData.length > 0 && (
          <BarChart
            data={chartData}
            xDataKey="time"
            aspectRatio="auto"
            className="h-full"
            margin={{ top: 6, right: 0, bottom: 4, left: 0 }}
            animationDuration={0}
            barGap={0.25}
          >
            <OPStatHoverBridge onHoverChange={setHover} />
            <Bar
              dataKey="sessionCount"
              fill={PRIMARY_COLOR}
              animate={false}
              lineCap={2}
            />
          </BarChart>
        )}
      </div>
    </MetricCardShell>
  );
}
