'use client';

import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { ReportRange } from '@/components/report/ReportRange';
import { Button } from '@/components/ui/button';
import { SheetTrigger } from '@/components/ui/sheet';
import { FilterIcon } from 'lucide-react';

export function OverviewReportRange() {
  const { previous, range, setRange, interval, metric, setMetric, filters } =
    useOverviewOptions();

  return <ReportRange value={range} onChange={(value) => setRange(value)} />;
}

export function OverviewFilterSheetTrigger() {
  const { previous, range, setRange, interval, metric, setMetric, filters } =
    useOverviewOptions();

  return (
    <SheetTrigger asChild>
      <Button variant="outline" responsive icon={FilterIcon}>
        Filters
      </Button>
    </SheetTrigger>
  );
}
