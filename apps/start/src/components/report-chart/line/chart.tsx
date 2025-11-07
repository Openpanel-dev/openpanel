import { useRechartDataModel } from '@/hooks/use-rechart-data-model';
import { useVisibleSeries } from '@/hooks/use-visible-series';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import type { IChartData } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';
import { useQuery } from '@tanstack/react-query';
import { isSameDay, isSameHour, isSameMonth, isSameWeek } from 'date-fns';
import { last } from 'ramda';
import { useCallback } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Customized,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useDashedStroke } from '@/hooks/use-dashed-stroke';
import { useXAxisProps, useYAxisProps } from '../common/axis';
import { ReportChartTooltip } from '../common/report-chart-tooltip';
import { ReportTable } from '../common/report-table';
import { SerieIcon } from '../common/serie-icon';
import { SerieName } from '../common/serie-name';
import { useReportChartContext } from '../context';

interface Props {
  data: IChartData;
}

export function Chart({ data }: Props) {
  const {
    report: {
      previous,
      interval,
      projectId,
      startDate,
      endDate,
      range,
      lineType,
    },
    isEditMode,
    options: { hideXAxis, hideYAxis, maxDomain },
  } = useReportChartContext();
  const dataLength = data.series[0]?.data?.length || 0;
  const trpc = useTRPC();
  const references = useQuery(
    trpc.reference.getChartReferences.queryOptions(
      {
        projectId,
        startDate,
        endDate,
        range,
      },
      {
        staleTime: 1000 * 60 * 10,
      },
    ),
  );
  const { series, setVisibleSeries } = useVisibleSeries(data);
  const rechartData = useRechartDataModel(series);

  let dotIndex = undefined;
  if (range === 'today') {
    // Find closest index based on times
    dotIndex = rechartData.findIndex((item) => {
      return isSameHour(item.date, new Date());
    });
  }

  const lastSerieDataItem = last(series[0]?.data || [])?.date || new Date();
  const useDashedLastLine = (() => {
    if (range === 'today') {
      return true;
    }

    if (interval === 'hour') {
      return isSameHour(lastSerieDataItem, new Date());
    }

    if (interval === 'day') {
      return isSameDay(lastSerieDataItem, new Date());
    }

    if (interval === 'month') {
      return isSameMonth(lastSerieDataItem, new Date());
    }

    if (interval === 'week') {
      return isSameWeek(lastSerieDataItem, new Date());
    }

    return false;
  })();

  const { getStrokeDasharray, calcStrokeDasharray, handleAnimationEnd } =
    useDashedStroke({
      dotIndex,
    });

  const CustomLegend = useCallback(() => {
    return (
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs mt-4 -mb-2">
        {series.map((serie) => (
          <div
            className="flex items-center gap-1"
            key={serie.id}
            style={{
              color: getChartColor(serie.index),
            }}
          >
            <SerieIcon name={serie.names} />
            <SerieName name={serie.names} className="font-semibold" />
          </div>
        ))}
      </div>
    );
  }, [series]);

  const xAxisProps = useXAxisProps({ interval, hide: hideXAxis });
  const yAxisProps = useYAxisProps({
    hide: hideYAxis,
  });

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

  return (
    <ReportChartTooltip.TooltipProvider references={references.data}>
      <div className={cn('h-full w-full', isEditMode && 'card p-4')}>
        <ResponsiveContainer>
          <ComposedChart data={rechartData} onClick={handleChartClick}>
            <Customized component={calcStrokeDasharray} />
            <Line
              dataKey="calcStrokeDasharray"
              legendType="none"
              animationDuration={0}
              onAnimationEnd={handleAnimationEnd}
            />
            <CartesianGrid
              strokeDasharray="3 3"
              horizontal={true}
              vertical={false}
              className="stroke-border"
            />
            {references.data?.map((ref) => (
              <ReferenceLine
                key={ref.id}
                x={ref.date.getTime()}
                stroke={'oklch(from var(--foreground) l c h / 0.1)'}
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
              {...yAxisProps}
              domain={maxDomain ? [0, maxDomain] : undefined}
            />
            <XAxis {...xAxisProps} />
            {series.length > 1 && <Legend content={<CustomLegend />} />}
            <Tooltip content={<ReportChartTooltip.Tooltip />} />
            {/* {series.map((serie) => {
              const color = getChartColor(serie.index);
              return (
                <React.Fragment key={serie.id}>
                  <defs>
                    {isAreaStyle && (
                      <linearGradient
                        id={`color${color}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="0%" stopColor={color} stopOpacity={0.8} />
                        <stop
                          offset="100%"
                          stopColor={color}
                          stopOpacity={0.1}
                        />
                      </linearGradient>
                    )}
                  </defs>
                  <Line
                    dot={isAreaStyle && dataLength <= 8}
                    type={lineType}
                    name={serie.id}
                    isAnimationActive={false}
                    strokeWidth={2}
                    dataKey={`${serie.id}:count`}
                    stroke={color}
                    strokeDasharray={
                      useDashedLastLine
                        ? getStrokeDasharray(`${serie.id}:count`)
                        : undefined
                    }
                    // Use for legend
                    fill={color}
                  />
                  {previous && (
                    <Line
                      type={lineType}
                      name={`${serie.id}:prev`}
                      isAnimationActive
                      dot={false}
                      strokeOpacity={0.3}
                      dataKey={`${serie.id}:prev:count`}
                      stroke={color}
                      // Use for legend
                      fill={color}
                    />
                  )}
                </React.Fragment>
              );
            })} */}

            <defs>
              <filter
                id="rainbow-line-glow"
                x="-20%"
                y="-20%"
                width="140%"
                height="140%"
              >
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feComponentTransfer in="blur" result="dimmedBlur">
                  <feFuncA type="linear" slope="0.5" />
                </feComponentTransfer>
                <feComposite
                  in="SourceGraphic"
                  in2="dimmedBlur"
                  operator="over"
                />
              </filter>
            </defs>

            {series.map((serie) => {
              const color = getChartColor(serie.index);
              return (
                <Line
                  key={serie.id}
                  dot={dataLength <= 8}
                  type={lineType}
                  name={serie.id}
                  isAnimationActive={false}
                  strokeWidth={2}
                  dataKey={`${serie.id}:count`}
                  stroke={color}
                  strokeDasharray={
                    useDashedLastLine
                      ? getStrokeDasharray(`${serie.id}:count`)
                      : undefined
                  }
                  // Use for legend
                  fill={color}
                  filter={
                    series.length === 1 ? 'url(#rainbow-line-glow)' : undefined
                  }
                />
              );
            })}

            {/* Previous */}
            {previous
              ? series.map((serie) => {
                  const color = getChartColor(serie.index);
                  return (
                    <Line
                      key={`${serie.id}:prev`}
                      type={lineType}
                      name={`${serie.id}:prev`}
                      isAnimationActive
                      dot={false}
                      strokeOpacity={0.3}
                      dataKey={`${serie.id}:prev:count`}
                      stroke={color}
                      // Use for legend
                      fill={color}
                    />
                  );
                })
              : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {isEditMode && (
        <ReportTable
          data={data}
          visibleSeries={series}
          setVisibleSeries={setVisibleSeries}
        />
      )}
    </ReportChartTooltip.TooltipProvider>
  );
}
