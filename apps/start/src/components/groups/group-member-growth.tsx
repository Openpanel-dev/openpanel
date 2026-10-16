import { curveMonotoneX } from 'd3-shape';
import { TrendingUpIcon } from 'lucide-react';
import { WidgetHead, WidgetTitle } from '../overview/overview-widget';
import { Area, AreaChart } from '@/components/charts/area-chart';
import { Grid } from '@/components/charts/grid';
import { OPChartTooltip } from '@/components/charts/op-tooltip';
import { XAxis } from '@/components/charts/x-axis';
import { YAxis } from '@/components/charts/y-axis';
import { Widget, WidgetBody } from '@/components/widget';
import { formatDateInterval } from '@/hooks/use-format-date-interval';
import { useNumber } from '@/hooks/use-numer-formatter';
import { getChartColor } from '@/utils/theme';

const MARGIN = { top: 12, right: 12, bottom: 28, left: 40 };
const FILL_OPACITY = 0.3;
const COLOR = getChartColor(0);

interface Point {
  [key: string]: unknown;
  date: string;
  count: number;
  cumulative: number;
}

interface Props {
  data: { date: string; count: number }[];
}

const formatDateLabel = (date: Date) =>
  formatDateInterval({ interval: 'day', date, short: true });

export function GroupMemberGrowth({ data }: Props) {
  const number = useNumber();

  let cumulative = 0;
  const points: Point[] = data.map((item) => {
    cumulative += item.count;
    return { date: item.date, count: item.count, cumulative };
  });

  return (
    <Widget className="w-full">
      <WidgetHead>
        <WidgetTitle icon={TrendingUpIcon}>
          New members last 30 days
        </WidgetTitle>
      </WidgetHead>
      <WidgetBody>
        {data.length === 0 ? (
          <p className="py-4 text-center text-muted-foreground text-sm">
            No data yet
          </p>
        ) : (
          <AreaChart
            animationDuration={0}
            aspectRatio="auto"
            className="h-[200px]"
            data={points}
            formatDateLabel={formatDateLabel}
            margin={MARGIN}
            xDataKey="date"
          >
            <Grid horizontal />
            <YAxis formatValue={number.short} />
            <XAxis />
            <Area
              animate={false}
              curve={curveMonotoneX}
              dataKey="cumulative"
              fill={COLOR}
              fillOpacity={FILL_OPACITY}
              stroke={COLOR}
            />
            <OPChartTooltip<Point>
              interval="day"
              rows={(point) => [
                {
                  color: COLOR,
                  label: 'Total members',
                  value: point.cumulative,
                  format: number.format,
                  sub:
                    point.count > 0
                      ? [
                          {
                            label: 'New',
                            value: `+${number.format(point.count)}`,
                          },
                        ]
                      : undefined,
                },
              ]}
              showCrosshair
              showDots
            />
          </AreaChart>
        )}
      </WidgetBody>
    </Widget>
  );
}
