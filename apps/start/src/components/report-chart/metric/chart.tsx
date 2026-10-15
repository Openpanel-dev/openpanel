import { useReportChartContext } from '../context';
import { MetricCard } from './metric-card';
import { MetricPager } from './metric-pager';
import { useVisibleSeries } from '@/hooks/use-visible-series';
import type { IChartData } from '@/trpc/client';
import { cn } from '@/utils/cn';

interface Props {
  data: IChartData;
}

export function Chart({ data }: Props) {
  const {
    isEditMode,
    layout,
    report: { metric, unit },
  } = useReportChartContext();
  const isTile = layout === 'fill';
  const { series } = useVisibleSeries(data, {
    limit: isTile || isEditMode ? 20 : 4,
  });

  if (isTile) {
    return <MetricPager metric={metric} series={series} unit={unit} />;
  }

  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-4',
        isEditMode && 'md:grid-cols-2 lg:grid-cols-3'
      )}
    >
      {series.map((serie) => {
        return (
          <MetricCard
            key={serie.id}
            metric={metric}
            serie={serie}
            unit={unit}
          />
        );
      })}
    </div>
  );
}
