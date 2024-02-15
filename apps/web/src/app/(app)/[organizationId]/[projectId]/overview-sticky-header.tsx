'use client';

import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { ReportRange } from '@/components/report/ReportRange';

export function OverviewReportRange() {
  const { range, setRange } = useOverviewOptions();
  return <ReportRange value={range} onChange={(value) => setRange(value)} />;
}
