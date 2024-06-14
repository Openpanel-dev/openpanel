import { pushModal } from '@/modals';
import { ScanEyeIcon } from 'lucide-react';

import type { IChartProps } from '@openpanel/validation';

type Props = {
  chart: IChartProps;
};

const OverviewDetailsButton = ({ chart }: Props) => {
  return (
    <button
      className="-mb-2 mt-5 flex w-full items-center justify-center gap-2 text-sm font-semibold"
      onClick={() => {
        pushModal('OverviewChartDetails', {
          chart: chart,
        });
      }}
    >
      <ScanEyeIcon size={18} /> Details
    </button>
  );
};

export default OverviewDetailsButton;
