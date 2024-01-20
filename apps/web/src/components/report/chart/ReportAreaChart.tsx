import type { IChartData } from '@/app/_trpc/client';
import { AutoSizer } from '@/components/AutoSizer';
import { useFormatDateInterval } from '@/hooks/useFormatDateInterval';
import { useRechartDataModel } from '@/hooks/useRechartDataModel';
import { useVisibleSeries } from '@/hooks/useVisibleSeries';
import type { IChartLineType, IInterval } from '@/types';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { getYAxisWidth } from './chart-utils';
import { useChartContext } from './ChartProvider';
import { ReportChartTooltip } from './ReportChartTooltip';
import { ReportTable } from './ReportTable';

interface ReportAreaChartProps {
  data: IChartData;
  interval: IInterval;
  lineType: IChartLineType;
}

export function ReportAreaChart({
  lineType,
  interval,
  data,
}: ReportAreaChartProps) {
  const { editMode } = useChartContext();
  const { series, setVisibleSeries } = useVisibleSeries(data);
  const formatDate = useFormatDateInterval(interval);
  const rechartData = useRechartDataModel(data);

  return (
    <>
      <div
        className={cn(
          'max-sm:-mx-3',
          editMode && 'border border-border bg-white rounded-md p-4'
        )}
      >
        <AutoSizer disableHeight>
          {({ width }) => (
            <AreaChart
              width={width}
              height={Math.min(Math.max(width * 0.5, 250), 400)}
              data={rechartData}
            >
              <Tooltip content={<ReportChartTooltip />} />
              <XAxis
                axisLine={false}
                fontSize={12}
                dataKey="date"
                tickFormatter={(m: string) => formatDate(m)}
                tickLine={false}
                allowDuplicatedCategory={false}
              />
              <YAxis
                width={getYAxisWidth(data.metrics.max)}
                fontSize={12}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />

              {series.map((serie) => {
                return (
                  <Area
                    key={serie.name}
                    type={lineType}
                    isAnimationActive={false}
                    strokeWidth={0}
                    dataKey={`${serie.index}:count`}
                    stroke={getChartColor(serie.index)}
                    fill={getChartColor(serie.index)}
                    stackId={'1'}
                    fillOpacity={1}
                  />
                );
              })}
              <CartesianGrid
                strokeDasharray="3 3"
                horizontal={true}
                vertical={false}
              />
            </AreaChart>
          )}
        </AutoSizer>
      </div>
      {editMode && (
        <ReportTable
          data={data}
          visibleSeries={series}
          setVisibleSeries={setVisibleSeries}
        />
      )}
    </>
  );
}
