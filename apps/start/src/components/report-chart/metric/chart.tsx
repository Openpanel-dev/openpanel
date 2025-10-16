import { useVisibleSeries } from '@/hooks/use-visible-series';
import type { IChartData } from '@/trpc/client';
import { cn } from '@/utils/cn';

import { useReportChartContext } from '../context';
import { MetricCard } from './metric-card';

interface Props {
  data: IChartData;
}

export function Chart({ data }: Props) {
  const {
    isEditMode,
    report: { metric, unit },
  } = useReportChartContext();
  const { series } = useVisibleSeries(data, isEditMode ? 20 : 4);
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-4',
        isEditMode && 'md:grid-cols-2 lg:grid-cols-3',
      )}
    >
      {series.map((serie) => {
        return (
          <MetricCard
            key={serie.id}
            serie={serie}
            metric={metric}
            unit={unit}
          />
        );
      })}
    </div>
  );
}
