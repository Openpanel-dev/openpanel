import { FullPageEmptyState } from '@/components/FullPageEmptyState';
import { cn } from '@/utils/cn';

import { useChartContext } from './ChartProvider';
import { MetricCardEmpty } from './MetricCard';

export function ChartEmpty() {
  const { editMode, chartType } = useChartContext();

  if (editMode) {
    return (
      <FullPageEmptyState title="No data">
        We could not find any data for selected events and filter.
      </FullPageEmptyState>
    );
  }

  if (chartType === 'metric') {
    return <MetricCardEmpty />;
  }

  return (
    <div
      className={
        'aspect-video w-full max-h-[300px] min-h-[200px] flex justify-center items-center'
      }
    >
      No data
    </div>
  );
}
