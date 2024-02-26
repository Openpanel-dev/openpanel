'use client';

import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { ReportRange } from '@/components/report/ReportRange';
import { endOfDay, startOfDay } from 'date-fns';

export function OverviewReportRange() {
  const { range, setRange, setEndDate, setStartDate, startDate, endDate } =
    useOverviewOptions();
  return (
    <ReportRange
      range={range}
      onRangeChange={(value) => {
        setRange(value);
        setStartDate(null);
        setEndDate(null);
      }}
      dates={{
        startDate,
        endDate,
      }}
      onDatesChange={(val) => {
        if (!val) return;

        if (val.from && val.to) {
          setRange(null);
          setStartDate(startOfDay(val.from).toISOString());
          setEndDate(endOfDay(val.to).toISOString());
        } else if (val.from) {
          setStartDate(startOfDay(val.from).toISOString());
        } else if (val.to) {
          setEndDate(endOfDay(val.to).toISOString());
        }
      }}
    />
  );
}
