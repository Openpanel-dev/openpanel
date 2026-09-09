import type { IInterval } from '@openpanel/core/modules/report/report.constants';
import { average, round } from '@openpanel/shared';
import { useQuery } from '@tanstack/react-query';
import React, { useCallback, useMemo } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { getPreviousMetric } from '../../../utils/previous-metric';
import { useXAxisProps, useYAxisProps } from '../common/axis';
import { PreviousDiffIndicator } from '../common/previous-diff-indicator';
import { SerieIcon } from '../common/serie-icon';
import { SerieName } from '../common/serie-name';
import { useReportChartContext } from '../context';
import { ConversionTable } from './conversion-table';
import {
  ChartTooltipHeader,
  ChartTooltipItem,
  createChartTooltip,
} from '@/components/charts/chart-tooltip';
import { changeVisibleSeries } from '@/components/report/reportSlice';
import { useConversionRechartDataModel } from '@/hooks/use-conversion-rechart-data-model';
import { useFormatDateInterval } from '@/hooks/use-format-date-interval';
import { useNumber } from '@/hooks/use-numer-formatter';
import { useVisibleConversionSeries } from '@/hooks/use-visible-conversion-series';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import { useDispatch } from '@/redux';
import type { RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';

interface Props {
  data: RouterOutputs['chart']['conversion'];
}

export function Chart({ data }: Props) {
  const {
    report: {
      interval,
      projectId,
      startDate,
      endDate,
      range,
      lineType,
      visibleSeries: savedVisibleSeries,
    },
    isEditMode,
    options: { hideXAxis, hideYAxis, maxDomain },
  } = useReportChartContext();
  const dispatch = useDispatch();
  const { series, setVisibleSeries } = useVisibleConversionSeries(data, {
    limit: 5,
    savedVisibleSeries,
    onVisibleSeriesChange: isEditMode
      ? (ids) => dispatch(changeVisibleSeries(ids))
      : undefined,
  });
  const rechartData = useConversionRechartDataModel(series);
  const trpc = useTRPC();
  const references = useQuery(
    trpc.reference.getChartReferences.queryOptions({
      projectId,
      startDate,
      endDate,
      range,
    })
  );

  const xAxisProps = useXAxisProps({ interval, hide: hideXAxis });
  const number = useNumber();

  // Calculate dynamic Y-axis domain based on max rate
  const yAxisDomain = useMemo(() => {
    if (!series.length) {
      return [0, 100];
    }

    const maxRate = Math.max(
      ...series.flatMap((serie) => serie.data.map((item) => item.rate))
    );

    if (maxRate <= 5) {
      return [0, 10];
    }
    if (maxRate <= 20) {
      return [0, 30];
    }
    if (maxRate <= 50) {
      return [0, 60];
    }
    return [0, 100];
  }, [series]);

  const yAxisProps = useYAxisProps({
    hide: hideYAxis,
    tickFormatter: (value: number) => {
      return `${number.short(value)}%`;
    },
  });

  const averageConversionRate = average(
    series.map((serie) => {
      return average(serie.data.map((item) => item.rate));
    }, 0)
  );

  // Show dots when we have 30 or fewer data points
  const showDots = rechartData.length <= 30;

  const handleChartClick = useCallback((e: any) => {
    if (e?.activePayload?.[0]) {
      const clickedData = e.activePayload[0].payload;
      if (clickedData.date) {
        pushModal('AddReference', {
          datetime: new Date(clickedData.date).toISOString(),
        });
      }
    }
  }, []);

  const CustomLegend = useCallback(() => {
    return (
      <div className="mt-4 -mb-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
        {series.map((serie) => (
          <div
            className="flex items-center gap-1"
            key={serie.id}
            style={{
              color: getChartColor(serie.index),
            }}
          >
            <SerieIcon name={serie.breakdowns} />
            <SerieName
              className="font-semibold"
              name={
                serie.breakdowns.length > 0 ? serie.breakdowns : ['Conversion']
              }
            />
          </div>
        ))}
      </div>
    );
  }, [series]);

  return (
    <TooltipProvider
      conversion={data}
      interval={interval}
      visibleSeries={series}
    >
      <div className={cn('h-full w-full', isEditMode && 'card p-4')}>
        <ResponsiveContainer>
          <LineChart data={rechartData} onClick={handleChartClick}>
            <CartesianGrid
              className="stroke-border"
              horizontal={true}
              strokeDasharray="3 3"
              vertical={false}
            />
            {references.data?.map((ref) => (
              <ReferenceLine
                fontSize={10}
                key={ref.id}
                label={{
                  value: ref.title,
                  position: 'centerTop',
                  fill: '#334155',
                  fontSize: 12,
                }}
                stroke={'oklch(from var(--foreground) l c h / 0.1)'}
                strokeDasharray={'3 3'}
                x={ref.date.getTime()}
              />
            ))}
            <YAxis {...yAxisProps} domain={yAxisDomain} />
            <XAxis {...xAxisProps} allowDuplicatedCategory={false} />
            {series.length > 1 && <Legend content={<CustomLegend />} />}
            <Tooltip />
            {series.map((serie) => {
              const color = getChartColor(serie.index);
              return (
                <Line
                  dataKey={`${serie.id}:previousRate`}
                  dot={false}
                  isAnimationActive={false}
                  key={`${serie.id}:previousRate`}
                  stroke={color}
                  strokeOpacity={0.3}
                  strokeWidth={1}
                  type={lineType}
                />
              );
            })}
            {series.map((serie) => {
              const color = getChartColor(serie.index);
              return (
                <Line
                  activeDot={showDots ? { r: 5, strokeWidth: 2 } : { r: 4 }}
                  dataKey={`${serie.id}:rate`}
                  dot={
                    showDots ? { r: 3, strokeWidth: 2, fill: 'white' } : false
                  }
                  isAnimationActive={false}
                  key={`${serie.id}:rate`}
                  stroke={color}
                  strokeWidth={2}
                  type={lineType}
                />
              );
            })}
            {typeof averageConversionRate === 'number' &&
              averageConversionRate && (
                <ReferenceLine
                  label={{
                    value: `Average (${round(averageConversionRate, 2)}%)`,
                    fill: getChartColor(series.length),
                    position: 'insideBottomRight',
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                  stroke={getChartColor(series.length)}
                  strokeDasharray="3 3"
                  strokeLinecap="round"
                  strokeOpacity={0.6}
                  strokeWidth={2}
                  y={averageConversionRate}
                />
              )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ConversionTable
        data={data}
        setVisibleSeries={setVisibleSeries}
        visibleSeries={series}
      />
    </TooltipProvider>
  );
}

const { Tooltip, TooltipProvider } = createChartTooltip<
  Record<string, any>,
  {
    conversion: RouterOutputs['chart']['conversion'];
    interval: IInterval;
    visibleSeries: RouterOutputs['chart']['conversion']['current'];
  }
>(({ data, context }) => {
  if (!(data && data[0])) {
    return null;
  }

  const payload = data[0];
  const { date } = payload;
  const formatDate = useFormatDateInterval({
    interval: context.interval,
    short: false,
  });
  const number = useNumber();

  return (
    <>
      {context.visibleSeries.map((serie, index) => {
        const rate = payload[`${serie.id}:rate`];
        const total = payload[`${serie.id}:total`];
        const previousRate = payload[`${serie.id}:previousRate`];

        if (rate === undefined) {
          return null;
        }

        const prevSerie = context.conversion?.previous?.find(
          (p) => p.id === serie.id
        );
        const prevItem = prevSerie?.data.find((d) => d.date === date);
        const previousMetric = getPreviousMetric(rate, previousRate);

        return (
          <React.Fragment key={serie.id}>
            {index === 0 && (
              <ChartTooltipHeader>
                <div>{formatDate(date)}</div>
              </ChartTooltipHeader>
            )}
            <ChartTooltipItem color={getChartColor(index)}>
              <div className="flex items-center gap-1">
                <SerieIcon
                  name={
                    serie.breakdowns.length > 0
                      ? serie.breakdowns
                      : ['Conversion']
                  }
                />
                <SerieName
                  name={
                    serie.breakdowns.length > 0
                      ? serie.breakdowns
                      : ['Conversion']
                  }
                />
              </div>
              <div className="flex justify-between gap-8 font-medium font-mono">
                <div className="row gap-1">
                  <span>{number.formatWithUnit(rate / 100, '%')}</span>
                  <span className="text-muted-foreground">({total})</span>
                  {prevItem && previousRate !== undefined && (
                    <span className="text-muted-foreground">
                      ({number.formatWithUnit(previousRate / 100, '%')})
                    </span>
                  )}
                </div>
                {previousRate !== undefined && (
                  <PreviousDiffIndicator {...previousMetric} />
                )}
              </div>
            </ChartTooltipItem>
          </React.Fragment>
        );
      })}
    </>
  );
});
