import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import {
  isHourIntervalEnabledByRange,
  isMinuteIntervalEnabledByRange,
} from '@openpanel/constants';
import { ClockIcon } from 'lucide-react';
import { ReportInterval } from '../report/ReportInterval';
import { Combobox } from '../ui/combobox';

export function OverviewInterval() {
  const { interval, setInterval, range, startDate, endDate } =
    useOverviewOptions();

  return (
    <ReportInterval
      interval={interval}
      onChange={setInterval}
      range={range}
      chartType="linear"
      startDate={startDate}
      endDate={endDate}
    />
  );
}
