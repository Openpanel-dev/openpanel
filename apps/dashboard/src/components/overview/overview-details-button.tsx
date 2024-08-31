import { pushModal } from '@/modals';
import { ScanEyeIcon } from 'lucide-react';

import type { IChartProps } from '@openpanel/validation';

import { Button } from '../ui/button';

type Props = {
  chart: IChartProps;
};

const OverviewDetailsButton = ({ chart }: Props) => {
  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={() => {
        pushModal('OverviewChartDetails', {
          chart: chart,
        });
      }}
    >
      <ScanEyeIcon size={18} />
    </Button>
  );
};

export default OverviewDetailsButton;
