'use client';

import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { TimeWindowPicker } from '@/components/time-window-picker';
import { endOfDay, formatISO, startOfDay } from 'date-fns';

export function OverviewRange() {
  const { range, setRange, setStartDate, setEndDate, endDate, startDate } =
    useOverviewOptions();

  return (
    <TimeWindowPicker
      onChange={setRange}
      value={range}
      onStartDateChange={(date) => {
        const d = formatISO(startOfDay(new Date(date)));
        setStartDate(d);
      }}
      onEndDateChange={(date) => {
        const d = formatISO(endOfDay(new Date(date)));
        setEndDate(d);
      }}
      endDate={endDate}
      startDate={startDate}
    />
  );
}
