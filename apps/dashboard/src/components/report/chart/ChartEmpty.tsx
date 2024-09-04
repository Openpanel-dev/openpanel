import { FullPageEmptyState } from '@/components/full-page-empty-state';

import { useChartContext } from './ChartProvider';
import { MetricCardEmpty } from './MetricCard';
import { ResponsiveContainer } from './ResponsiveContainer';

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
    <ResponsiveContainer>
      <div className={'flex h-full w-full items-center justify-center'}>
        No data
      </div>
    </ResponsiveContainer>
  );
}
