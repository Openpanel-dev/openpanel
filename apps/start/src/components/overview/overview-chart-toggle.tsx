import type { IChartType } from '@openpanel/core/modules/report/report.constants';
import { BarChartIcon, LineChartIcon } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { Button } from '../ui/button';

interface Props {
  chartType: IChartType;
  setChartType: Dispatch<SetStateAction<IChartType>>;
}
export function OverviewChartToggle({ chartType, setChartType }: Props) {
  return (
    <Button
      onClick={() => {
        setChartType((p) => (p === 'linear' ? 'bar' : 'linear'));
      }}
      size={'icon'}
      variant={'ghost'}
    >
      {chartType === 'bar' ? (
        <LineChartIcon size={16} />
      ) : (
        <BarChartIcon size={16} />
      )}
    </Button>
  );
}
