'use client';

import React from 'react';
import { useFormatDateInterval } from '@/hooks/useFormatDateInterval';
import { useNumber } from '@/hooks/useNumerFormatter';
import { useRechartDataModel } from '@/hooks/useRechartDataModel';
import { useVisibleSeries } from '@/hooks/useVisibleSeries';
import type { IChartData } from '@/trpc/client';
import { getChartColor } from '@/utils/theme';
import { SplineIcon } from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { IServiceReference } from '@openpanel/db';
import type { IChartLineType, IInterval } from '@openpanel/validation';

import { getYAxisWidth } from './chart-utils';
import { useChartContext } from './ChartProvider';
import { ReportChartTooltip } from './ReportChartTooltip';
import { ReportTable } from './ReportTable';
import { ResponsiveContainer } from './ResponsiveContainer';

interface ReportLineChartProps {
  data: IChartData;
  references: IServiceReference[];
  interval: IInterval;
  lineType: IChartLineType;
}

function CustomLegend(props: {
  payload?: { value: string; payload: { fill: string } }[];
}) {
  if (!props.payload) {
    return null;
  }

  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
      {props.payload
        .filter((entry) => !entry.value.includes('noTooltip'))
        .filter((entry) => !entry.value.includes(':prev'))
        .map((entry) => (
          <div className="flex gap-1" key={entry.value}>
            <SplineIcon size={12} color={entry.payload.fill} />
            <div
              style={{
                color: entry.payload.fill,
              }}
            >
              {entry.value}
            </div>
          </div>
        ))}
    </div>
  );
}

export function ReportLineChart({
  lineType,
  interval,
  data,
  references,
}: ReportLineChartProps) {
  const { editMode, previous } = useChartContext();
  const formatDate = useFormatDateInterval(interval);
  const { series, setVisibleSeries } = useVisibleSeries(data);
  const rechartData = useRechartDataModel(series);
  const number = useNumber();

  // great care should be taken when computing lastIntervalPercent
  // the expression below works for data.length - 1 equal intervals
  // but if there are numeric x values in a "linear" axis, the formula
  // should be updated to use those values
  const lastIntervalPercent =
    ((rechartData.length - 2) * 100) / (rechartData.length - 1);

  const gradientTwoColors = (
    id: string,
    col1: string,
    col2: string,
    percentChange: number
  ) => (
    <linearGradient id={id} x1="0" y1="0" x2="100%" y2="0">
      <stop offset="0%" stopColor={col1} />
      <stop offset={`${percentChange}%`} stopColor={col1} />
      <stop offset={`${percentChange}%`} stopColor={`${col2}`} />
      <stop offset="100%" stopColor={col2} />
    </linearGradient>
  );

  const useDashedLastLine = (series[0]?.data?.length || 0) > 2;

  return (
    <>
      <ResponsiveContainer>
        {({ width, height }) => (
          <LineChart width={width} height={height} data={rechartData}>
            <CartesianGrid
              strokeDasharray="3 3"
              horizontal={true}
              vertical={false}
              className="stroke-def-200"
            />
            {references.map((ref) => (
              <ReferenceLine
                key={ref.id}
                x={ref.date.getTime()}
                stroke={'#94a3b8'}
                strokeDasharray={'3 3'}
                label={{
                  value: ref.title,
                  position: 'centerTop',
                  fill: '#334155',
                  fontSize: 12,
                }}
                fontSize={10}
              />
            ))}
            <YAxis
              width={getYAxisWidth(data.metrics.max)}
              fontSize={12}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              tickFormatter={number.short}
            />
            {series.length > 1 && (
              <Legend
                wrapperStyle={{ fontSize: '10px' }}
                content={<CustomLegend />}
              />
            )}
            <Tooltip content={<ReportChartTooltip />} />
            <XAxis
              axisLine={false}
              fontSize={12}
              dataKey="timestamp"
              scale="utc"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(m: string) => formatDate(new Date(m))}
              type="number"
              tickLine={false}
            />
            {series.map((serie) => {
              return (
                <React.Fragment key={serie.name}>
                  <defs>
                    {gradientTwoColors(
                      `hideAllButLastInterval_${serie.id}`,
                      'rgba(0,0,0,0)',
                      getChartColor(serie.index),
                      lastIntervalPercent
                    )}
                    {gradientTwoColors(
                      `hideJustLastInterval_${serie.id}`,
                      getChartColor(serie.index),
                      'rgba(0,0,0,0)',
                      lastIntervalPercent
                    )}
                  </defs>
                  <Line
                    dot={false}
                    type={lineType}
                    name={serie.name}
                    isAnimationActive={false}
                    strokeWidth={2}
                    dataKey={`${serie.id}:count`}
                    stroke={
                      useDashedLastLine
                        ? 'transparent'
                        : getChartColor(serie.index)
                    }
                    // Use for legend
                    fill={getChartColor(serie.index)}
                  />
                  {useDashedLastLine && (
                    <>
                      <Line
                        dot={false}
                        type={lineType}
                        name={`${serie.name}:dashed:noTooltip`}
                        isAnimationActive={false}
                        strokeWidth={2}
                        dataKey={`${serie.id}:count`}
                        stroke={`url('#hideAllButLastInterval_${serie.id}')`}
                        strokeDasharray="4 2"
                        strokeOpacity={0.7}
                      />
                      <Line
                        dot={false}
                        type={lineType}
                        name={`${serie.name}:solid:noTooltip`}
                        isAnimationActive={false}
                        strokeWidth={2}
                        dataKey={`${serie.id}:count`}
                        stroke={`url('#hideJustLastInterval_${serie.id}')`}
                      />
                    </>
                  )}
                  {previous && (
                    <Line
                      type={lineType}
                      name={`${serie.name}:prev`}
                      isAnimationActive={false}
                      strokeWidth={1}
                      dot={false}
                      strokeDasharray={'1 1'}
                      strokeOpacity={0.5}
                      dataKey={`${serie.id}:prev:count`}
                      stroke={getChartColor(serie.index)}
                      // Use for legend
                      fill={getChartColor(serie.index)}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </LineChart>
        )}
      </ResponsiveContainer>
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
