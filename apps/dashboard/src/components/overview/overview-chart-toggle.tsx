import { BarChartIcon, LineChartIcon } from 'lucide-react';

import { Button } from '../ui/button';
import { useOverviewOptions } from './useOverviewOptions';

export function OverviewChartToggle() {
  const { chartType, setChartType } = useOverviewOptions();
  return (
    <Button
      size={'icon'}
      variant={'outline'}
      onClick={() => {
        setChartType((p) => (p === 'linear' ? 'bar' : 'linear'));
      }}
    >
      {chartType === 'bar' ? (
        <LineChartIcon size={16} />
      ) : (
        <BarChartIcon size={16} />
      )}
    </Button>
  );
}
