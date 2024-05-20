import { ChartSwitch } from '@/components/report/chart';
import { ScrollArea } from '@/components/ui/scroll-area';

import type { IChartInput } from '@openpanel/validation';

import { ModalContent, ModalHeader } from './Modal/Container';

type Props = {
  chart: IChartInput;
};

const OverviewChartDetails = (props: Props) => {
  return (
    <ModalContent>
      <ModalHeader title={props.chart.name} />
      <ScrollArea className="-m-6 max-h-[calc(100vh-200px)]">
        <div className="p-6">
          <ChartSwitch {...props.chart} limit={999} chartType="bar" />
        </div>
      </ScrollArea>
    </ModalContent>
  );
};

export default OverviewChartDetails;
