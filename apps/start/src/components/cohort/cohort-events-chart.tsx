import { curveMonotoneX } from 'd3-shape';
import { ActivityIcon } from 'lucide-react';
import { WidgetHead, WidgetTitle } from '../overview/overview-widget';
import { Area, AreaChart } from '@/components/charts/area-chart';
import { Grid } from '@/components/charts/grid';
import { OPChartTooltip } from '@/components/charts/op-tooltip';
import { XAxis } from '@/components/charts/x-axis';
import { YAxis } from '@/components/charts/y-axis';
import { EmptyState } from '@/components/empty-state';
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
}

interface Props {
  data: Point[];
}

const formatDateLabel = (date: Date) =>
  formatDateInterval({ interval: 'day', date, short: true });

export function CohortEventsChart({ data }: Props) {
  const number = useNumber();
  const total = data.reduce((acc, point) => acc + point.count, 0);

  return (
    <Widget className="w-full">
      <WidgetHead>
        <WidgetTitle icon={ActivityIcon}>
          Events last 30 days ({total.toLocaleString()})
        </WidgetTitle>
      </WidgetHead>
      <WidgetBody>
        {total === 0 ? (
          <EmptyState
            className="h-[200px]"
            description="Events from people in this cohort will be charted here."
            icon={ActivityIcon}
            title="No events in the last 30 days"
            variant="inline"
          />
        ) : (
          <AreaChart
            animationDuration={0}
            aspectRatio="auto"
            className="h-[200px]"
            data={data}
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
              dataKey="count"
              fill={COLOR}
              fillOpacity={FILL_OPACITY}
              stroke={COLOR}
            />
            <OPChartTooltip<Point>
              interval="day"
              rows={(point) => [
                {
                  color: COLOR,
                  label: 'Events',
                  value: point.count,
                  format: number.format,
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
