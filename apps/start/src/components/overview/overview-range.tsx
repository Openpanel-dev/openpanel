import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { TimeWindowPicker } from '@/components/time-window-picker';

export function OverviewRange() {
  const {
    range,
    setRange,
    setStartDate,
    setEndDate,
    endDate,
    startDate,
    setInterval,
  } = useOverviewOptions();

  return (
    <TimeWindowPicker
      endDate={endDate}
      onChange={setRange}
      onEndDateChange={setEndDate}
      onIntervalChange={setInterval}
      onStartDateChange={setStartDate}
      startDate={startDate}
      value={range}
    />
  );
}
