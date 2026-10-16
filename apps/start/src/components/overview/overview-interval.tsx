import { ReportInterval } from '../report/ReportInterval';
import { useOverviewOptions } from '@/components/overview/useOverviewOptions';

export function OverviewInterval() {
  const { interval, setInterval, range, startDate, endDate } =
    useOverviewOptions();

  return (
    <ReportInterval
      chartType="linear"
      endDate={endDate}
      interval={interval}
      onChange={setInterval}
      range={range}
      startDate={startDate}
    />
  );
}
