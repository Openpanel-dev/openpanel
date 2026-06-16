import { useNumber } from '@/hooks/use-numer-formatter';
import { useRechartDataModel } from '@/hooks/use-rechart-data-model';
import { useVisibleSeries } from '@/hooks/use-visible-series';
import type { IChartData } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  ChartTooltipContainer,
  ChartTooltipHeader,
  ChartTooltipItem,
} from '@/components/charts/chart-tooltip';
import { X_AXIS_STYLE_PROPS, useYAxisProps } from '../common/axis';
import { ReportTable } from '../common/report-table';
import { SerieIcon } from '../common/serie-icon';
import { SerieName } from '../common/serie-name';
import { useReportChartContext } from '../context';

interface Props {
  data: IChartData;
}

// Distribution x-axis is a categorical bucket label ("1", "4-5", "10+", or a
// numeric bin lower-bound), NOT a date — so we render a plain category axis and
// a bucket-aware tooltip instead of the date-based chart helpers.
const DistributionTooltip = ({ payload }: { payload?: any[] }) => {
  const number = useNumber();
  const bucket = payload?.[0]?.payload?.date;
  return (
    <ChartTooltipContainer>
      {bucket !== undefined && (
        <ChartTooltipHeader>
          <div>{String(bucket)}</div>
        </ChartTooltipHeader>
      )}
      {payload?.map((item) => {
        const meta = item.payload?.[`${item.name}:payload`];
        return (
          <ChartTooltipItem key={item.name} color={item.color ?? meta?.color}>
            <div className="flex items-center gap-1">
              {meta?.event?.name && <SerieIcon name={meta.event.name} />}
              <SerieName
                name={meta?.names ?? [item.name]}
                className="font-medium"
              />
            </div>
            <div className="font-mono font-medium">
              {number.formatWithUnit(item.value)}
            </div>
          </ChartTooltipItem>
        );
      })}
    </ChartTooltipContainer>
  );
};

export function Chart({ data }: Props) {
  const {
    isEditMode,
    options: { hideXAxis, hideYAxis },
  } = useReportChartContext();
  const { series, setVisibleSeries } = useVisibleSeries(data);
  const rechartData = useRechartDataModel(series);
  const yAxisProps = useYAxisProps({ hide: hideYAxis });

  return (
    <div className={cn('h-full w-full', isEditMode && 'card p-4')}>
      <ResponsiveContainer>
        <BarChart data={rechartData}>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            className="stroke-def-200"
          />
          <Tooltip
            content={<DistributionTooltip />}
            cursor={{ fillOpacity: 0.1 }}
          />
          <YAxis {...yAxisProps} />
          <XAxis
            {...X_AXIS_STYLE_PROPS}
            height={hideXAxis ? 0 : X_AXIS_STYLE_PROPS.height}
            dataKey="date"
            type="category"
            scale="auto"
          />
          {series.map((serie) => (
            <Bar
              key={serie.id}
              name={serie.id}
              dataKey={`${serie.id}:count`}
              fill={getChartColor(serie.index)}
              radius={5}
              fillOpacity={1}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      {isEditMode && (
        <ReportTable
          data={data}
          visibleSeries={series}
          setVisibleSeries={setVisibleSeries}
        />
      )}
    </div>
  );
}
