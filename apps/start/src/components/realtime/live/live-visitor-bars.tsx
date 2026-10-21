import { useQuery } from '@tanstack/react-query';
import { Bar } from '@/components/charts/bar';
import { BarChart } from '@/components/charts/bar-chart';
import { OPChartTooltip } from '@/components/charts/op-tooltip';
import { useNumber } from '@/hooks/use-numer-formatter';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/trpc/client';

/** Matches the dots on the map, so everything live reads as one colour. */
const BAR_COLOR = 'var(--color-emerald-500)';
const BAR_RADIUS = 1;
const BAR_GAP = 0.25;
const NO_MARGIN = { top: 0, right: 0, bottom: 0, left: 0 };

type MinutePoint =
  RouterOutputs['overview']['liveData']['minuteCounts'][number] & {
    [key: string]: unknown;
  };

export function LiveVisitorBars({ projectId }: { projectId: string }) {
  const trpc = useTRPC();
  const number = useNumber();
  const { data } = useQuery(trpc.overview.liveData.queryOptions({ projectId }));
  const points: MinutePoint[] = (data?.minuteCounts ?? []).map((point) => ({
    ...point,
  }));

  return (
    <div className="pointer-events-auto flex flex-col gap-2 rounded-xl border bg-card/80 p-3 shadow-sm backdrop-blur-md">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium text-2xs text-muted-foreground uppercase tracking-widest">
          Last 30 minutes
        </span>
        <span className="font-semibold text-sm tabular-nums">
          {number.format(data?.totalSessions ?? 0)}
          <span className="ml-1 font-normal text-muted-foreground text-xs">
            visitors
          </span>
        </span>
      </div>
      <div className="h-14 w-full">
        {points.length > 0 ? (
          <BarChart
            animationDuration={0}
            aspectRatio="auto"
            barGap={BAR_GAP}
            className="h-full"
            data={points}
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
              rows={(point) => [
                {
                  color: BAR_COLOR,
                  label: 'Visitors',
                  value: point.visitorCount,
                  format: number.format,
                },
              ]}
              showDots={false}
              title={(point) => point.time}
            />
          </BarChart>
        ) : null}
      </div>
    </div>
  );
}
