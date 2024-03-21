import type { Dispatch, SetStateAction } from 'react';
import { BarChartIcon, LineChartIcon } from 'lucide-react';

import type { IChartType } from '@openpanel/validation';

import { Button } from '../ui/button';

interface Props {
  chartType: IChartType;
  setChartType: Dispatch<SetStateAction<IChartType>>;
}
export function OverviewChartToggle({ chartType, setChartType }: Props) {
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
