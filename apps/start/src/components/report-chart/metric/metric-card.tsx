import type { IChartMetric } from '@openpanel/core/modules/report/report.constants';
import { useMemo } from 'react';
import { useReportChartContext } from '../context';
import {
  type MetricUnit,
  OverviewMetricCard,
} from '@/components/overview/overview-metric-card';
import type { IChartData } from '@/trpc/client';

// Report units the card formats itself; any other unit shows the plain number.
const CARD_UNITS: Record<string, MetricUnit> = { min: 'min', '%': '%' };

interface MetricCardProps {
  serie: IChartData['series'][number];
  metric: IChartMetric;
  unit?: string;
  fill?: boolean;
}

/** One series of a metric report, drawn as the overview's metric card. */
export function MetricCard({ serie, metric, unit, fill }: MetricCardProps) {
  const {
    report: { interval, range },
  } = useReportChartContext();
  const buckets = useMemo(
    () =>
      serie.data.map((item) => ({
        date: item.date,
        current: item.count,
        previous: item.previous?.value,
      })),
    [serie.data]
  );

  return (
    <OverviewMetricCard
      data={buckets}
      fill={fill}
      id={serie.id}
      interval={interval}
      label={serie.names.join(' › ')}
      metric={{
        current: serie.metrics[metric] ?? 0,
        previous: serie.metrics.previous?.[metric]?.value,
      }}
      range={range}
      unit={unit ? (CARD_UNITS[unit] ?? '') : ''}
    />
  );
}
