'use client';

import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { TimeWindowPicker } from '@/components/time-window-picker';

export function OverviewReportRange() {
  const { range, setRange, setStartDate, setEndDate, endDate, startDate } =
    useOverviewOptions();

  return (
    <TimeWindowPicker
      onChange={setRange}
      value={range}
      onStartDateChange={(date) => setStartDate(date)}
      onEndDateChange={(date) => setEndDate(date)}
      endDate={endDate}
      startDate={startDate}
    />
  );
}
