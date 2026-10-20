import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { AnimatedNumber } from '../animated-number';
import { SerieIcon } from '../report-chart/common/serie-icon';
import { Bar } from '@/components/charts/bar';
import { BarChart } from '@/components/charts/bar-chart';
import { OPChartTooltip } from '@/components/charts/op-tooltip';
import { useNumber } from '@/hooks/use-numer-formatter';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/trpc/client';
import { getChartColor } from '@/utils/theme';

const BAR_COLOR = getChartColor(0);
const BAR_RADIUS = 1;
const BAR_GAP = 0.25;
const NO_MARGIN = { top: 0, right: 0, bottom: 0, left: 0 };
const TOOLTIP_REFERRERS = 3;

type MinutePoint =
  RouterOutputs['overview']['liveData']['minuteCounts'][number] & {
    [key: string]: unknown;
  };

interface RealtimeLiveHistogramProps {
  projectId: string;
}

export function RealtimeLiveHistogram({
  projectId,
}: RealtimeLiveHistogramProps) {
  const trpc = useTRPC();
  const number = useNumber();

  // Use the same liveData endpoint as overview
  const { data: liveData, isLoading } = useQuery(
    trpc.overview.liveData.queryOptions({ projectId })
  );

  const chartData: MinutePoint[] = (liveData?.minuteCounts ?? []).map(
    (point) => ({ ...point })
  );
  // Approximation: totalSessions, not unique visitors across the window.
  const totalVisitors = liveData?.totalSessions ?? 0;

  if (isLoading) {
    return (
      <Wrapper count={0}>
        <div className="h-full w-full animate-pulse rounded bg-def-200" />
      </Wrapper>
    );
  }

  if (!liveData) {
    return null;
  }

  return (
    <Wrapper count={totalVisitors}>
      <BarChart
        animationDuration={0}
        aspectRatio="auto"
        barGap={BAR_GAP}
        className="h-full"
        data={chartData}
        margin={NO_MARGIN}
        xDataKey="time"
      >
        <Bar
          animate={false}
          dataKey="visitorCount"
          fill={BAR_COLOR}
          lineCap={BAR_RADIUS}
        />
        <OPChartTooltip<MinutePoint>
          datePill={false}
          extra={renderReferrers}
          rows={(point) => [
            {
              color: BAR_COLOR,
              label: 'Active users',
              value: point.visitorCount,
              format: number.format,
            },
          ]}
          showDots={false}
          title={(point) => point.time}
        />
      </BarChart>
    </Wrapper>
  );
}

function renderReferrers(point: MinutePoint) {
  if (point.referrers.length === 0) {
    return null;
  }
  const hidden = point.referrers.length - TOOLTIP_REFERRERS;
  return (
    <div className="mt-1 border-border border-t pt-2">
      <div className="mb-2 text-muted-foreground text-xs">Referrers:</div>
      <div className="space-y-1">
        {point.referrers.slice(0, TOOLTIP_REFERRERS).map((ref) => (
          <div
            className="row items-center justify-between text-xs"
            key={ref.referrer}
          >
            <div className="row items-center gap-1">
              <SerieIcon name={ref.referrer} />
              <span className="max-w-[120px] truncate" title={ref.referrer}>
                {ref.referrer}
              </span>
            </div>
            <span className="font-mono">{ref.count}</span>
          </div>
        ))}
        {hidden > 0 && (
          <div className="text-muted-foreground text-xs">+{hidden} more</div>
        )}
      </div>
    </div>
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
      <div className="row justify-between gap-2">
        <div className="relative font-medium text-muted-foreground text-sm">
          Unique visitors last 30 min
        </div>
        <div>{icons}</div>
      </div>
      <div className="col -mt-1 gap-2">
        <div className="font-bold font-mono text-5xl">
          <AnimatedNumber value={count} />
        </div>
      </div>
      <div className="relative -mt-2 aspect-[6/1] w-full">{children}</div>
    </div>
  );
}
