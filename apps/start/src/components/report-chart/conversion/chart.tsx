import { average, round } from '@openpanel/shared';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { getCurve } from '../common/curve';
import { PointClick } from '../common/point-click';
import { SerieIcon } from '../common/serie-icon';
import { SerieName } from '../common/serie-name';
import { previousPeriodColor } from '../common/time-series';
import { useReportChartContext } from '../context';
import { Grid } from '@/components/charts/grid';
import { Line, LineChart } from '@/components/charts/line-chart';
import { OPReferences } from '@/components/charts/op-references';
import {
  OPChartTooltip,
  type OPTooltipRow,
} from '@/components/charts/op-tooltip';
import { XAxis } from '@/components/charts/x-axis';
import { YAxis } from '@/components/charts/y-axis';
import { useConversionRechartDataModel } from '@/hooks/use-conversion-rechart-data-model';
import { formatDateInterval } from '@/hooks/use-format-date-interval';
import { useNumber } from '@/hooks/use-numer-formatter';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import type { RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';

const AXIS_MARGIN = { top: 12, right: 12, bottom: 28, left: 40 };
const BARE_MARGIN = { top: 12, right: 12, bottom: 12, left: 12 };
const MARKERS_MAX_POINTS = 30;

type ConversionSeries = RouterOutputs['chart']['conversion']['current'];
type ConversionPoint = Record<string, unknown> & { date: string };

const seriesNames = (serie: ConversionSeries[number]) =>
  serie.breakdowns.length > 0 ? serie.breakdowns : ['Conversion'];

export function Chart({
  series,
}: {
  series: (ConversionSeries[number] & { index: number })[];
}) {
  const {
    report: { interval, projectId, startDate, endDate, range, lineType },
    isEditMode,
    shareId,
    options: { hideXAxis, hideYAxis },
  } = useReportChartContext();
  const number = useNumber();
  const trpc = useTRPC();
  const references = useQuery(
    trpc.reference.getChartReferences.queryOptions({
      projectId,
      startDate,
      endDate,
      range,
    })
  );
  const averageRate = average(
    series.map((serie) => average(serie.data.map((item) => item.rate)))
  );
  const averageColor = getChartColor(series.length);
  const rechartData = useConversionRechartDataModel(series);
  const chartData = useMemo(
    () =>
      rechartData.map(
        (point): ConversionPoint => ({
          ...point,
          date: String(point.date),
          average: averageRate,
        })
      ),
    [rechartData, averageRate]
  );
  const curve = getCurve(lineType);

  const formatDateLabel = useCallback(
    (date: Date) => formatDateInterval({ interval, date, short: true }),
    [interval]
  );
  const formatRate = useCallback(
    (rate: number) => number.formatWithUnit(rate / 100, '%'),
    [number]
  );
  const tooltipRows = useCallback(
    (point: ConversionPoint): OPTooltipRow[] =>
      series.flatMap((serie) => {
        const rate = point[`${serie.id}:rate`];
        if (typeof rate !== 'number') {
          return [];
        }
        const previous = point[`${serie.id}:previousRate`];
        return [
          {
            color: getChartColor(serie.index),
            icon: <SerieIcon name={seriesNames(serie)} />,
            label: <SerieName name={seriesNames(serie)} />,
            value: rate,
            previous: typeof previous === 'number' ? previous : undefined,
            format: formatRate,
            sub: [
              { label: 'Total', value: Number(point[`${serie.id}:total`]) },
            ],
          },
        ];
      }),
    [series, formatRate]
  );
  const addReference = useCallback((point: ConversionPoint) => {
    pushModal('AddReference', {
      datetime: new Date(point.date).toISOString(),
    });
  }, []);

  return (
    <div className={cn('col h-full w-full', isEditMode && 'card p-4')}>
      <div
        className="relative min-h-0 flex-1"
        data-report-chart="conversion"
        data-visible-series={series.length}
      >
        <LineChart
          animationDuration={0}
          aspectRatio="auto"
          className="h-full"
          data={chartData}
          formatDateLabel={formatDateLabel}
          margin={hideXAxis && hideYAxis ? BARE_MARGIN : AXIS_MARGIN}
          style={{ touchAction: 'pan-y' }}
          xDataKey="date"
        >
          <Grid horizontal />
          {!hideYAxis && (
            <YAxis formatValue={(value) => `${number.short(value)}%`} />
          )}
          {!hideXAxis && <XAxis />}
          {series.map((serie) => (
            <Line
              animate={false}
              curve={curve}
              dataKey={`${serie.id}:previousRate`}
              key={`${serie.id}:previousRate`}
              showHighlight={false}
              stroke={previousPeriodColor(serie.index)}
              strokeWidth={1}
            />
          ))}
          {series.map((serie) => (
            <Line
              animate={false}
              curve={curve}
              dataKey={`${serie.id}:rate`}
              key={`${serie.id}:rate`}
              showMarkers={chartData.length <= MARKERS_MAX_POINTS}
              stroke={getChartColor(serie.index)}
              strokeWidth={2}
            />
          ))}
          <Line
            animate={false}
            dashArray="4,4"
            dashFromIndex={0}
            dataKey="average"
            showHighlight={false}
            stroke={averageColor}
            strokeWidth={1.5}
          />
          <OPReferences items={references.data} />
          <OPChartTooltip<ConversionPoint>
            interval={interval}
            references={references.data}
            rows={tooltipRows}
            showCrosshair
            showDots
          />
          {!shareId && <PointClick<ConversionPoint> onClick={addReference} />}
        </LineChart>
        <div
          className="pointer-events-none absolute top-0 right-3 font-medium text-xs"
          style={{ color: averageColor }}
        >
          Average ({round(averageRate, 2)}%)
        </div>
      </div>
      {series.length > 1 && (
        <div className="flex shrink-0 flex-wrap justify-center gap-x-4 gap-y-1 pt-2 text-xs">
          {series.map((serie) => (
            <div
              className="flex items-center gap-1"
              key={serie.id}
              style={{ color: getChartColor(serie.index) }}
            >
              <SerieIcon name={seriesNames(serie)} />
              <SerieName className="font-semibold" name={seriesNames(serie)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
