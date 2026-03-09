import { useQuery } from '@tanstack/react-query';
import { Tooltiper } from '../ui/tooltip';
import { LazyComponent } from '@/components/lazy-component';
import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { useTRPC } from '@/integrations/trpc/react';

interface SparklineBarsProps {
  data: { date: string; pageviews: number }[];
}

const gap = 1;
const height = 24;
const width = 100;

function getTrendDirection(data: { pageviews: number }[]): '↑' | '↓' | '→' {
  const n = data.length;
  if (n < 3) {
    return '→';
  }
  const third = Math.max(1, Math.floor(n / 3));
  const firstAvg =
    data.slice(0, third).reduce((s, d) => s + d.pageviews, 0) / third;
  const lastAvg =
    data.slice(n - third).reduce((s, d) => s + d.pageviews, 0) / third;
  const threshold = firstAvg * 0.05;
  if (lastAvg - firstAvg > threshold) {
    return '↑';
  }
  if (firstAvg - lastAvg > threshold) {
    return '↓';
  }
  return '→';
}

function SparklineBars({ data }: SparklineBarsProps) {
  if (!data.length) {
    return <div style={{ height, width }} />;
  }
  const max = Math.max(...data.map((d) => d.pageviews), 1);
  const total = data.length;
  const barW = Math.max(2, Math.floor((width - gap * (total - 1)) / total));
  const trend = getTrendDirection(data);
  const trendColor =
    trend === '↑'
      ? 'text-emerald-500'
      : trend === '↓'
        ? 'text-red-500'
        : 'text-muted-foreground';

  return (
    <div className="flex items-center gap-1.5">
      <svg className="shrink-0" height={height} width={width}>
        {data.map((d, i) => {
          const barH = Math.max(
            2,
            Math.round((d.pageviews / max) * (height * 0.8))
          );
          return (
            <rect
              className="fill-chart-0"
              height={barH}
              key={d.date}
              rx="1"
              width={barW}
              x={i * (barW + gap)}
              y={height - barH}
            />
          );
        })}
      </svg>
      <Tooltiper
        content={
          trend === '↑'
            ? 'Upgoing trend'
            : trend === '↓'
              ? 'Downgoing trend'
              : 'Stable trend'
        }
      >
        <span className={`shrink-0 font-medium text-xs ${trendColor}`}>
          {trend}
        </span>
      </Tooltiper>
    </div>
  );
}

interface PageSparklineProps {
  projectId: string;
  origin: string;
  path: string;
}

export function PageSparkline({ projectId, origin, path }: PageSparklineProps) {
  const { range, interval } = useOverviewOptions();
  const trpc = useTRPC();

  const query = useQuery(
    trpc.event.pageTimeseries.queryOptions({
      projectId,
      range,
      interval,
      origin,
      path,
    })
  );

  return (
    <LazyComponent fallback={<div style={{ height, width }} />}>
      <SparklineBars data={query.data ?? []} />
    </LazyComponent>
  );
}
