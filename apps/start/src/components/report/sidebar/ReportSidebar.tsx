import { ReportBreakdowns } from './ReportBreakdowns';
import { ReportGlobalFilters } from './ReportGlobalFilters';
import { ReportSeries } from './ReportSeries';
import { ReportSettings } from './ReportSettings';
import { ReportFixedEvents } from './report-fixed-events';
import { ReportHoldProperties } from './report-hold-properties';
import { Button } from '@/components/ui/button';
import {
  SheetClose,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useSelector } from '@/redux';

export function ReportSidebar() {
  const { chartType, options } = useSelector((state) => state.report);
  const showBreakdown = chartType !== 'retention' && chartType !== 'sankey';
  const showFixedEvents = chartType === 'sankey';
  const showHoldProperties =
    chartType === 'funnel' || chartType === 'conversion';
  return (
    <>
      <SheetHeader>
        <div className="flex flex-col gap-1">
          <SheetTitle>Report builder</SheetTitle>
          <SheetDescription>
            What to measure, how to filter it and how to split it.
          </SheetDescription>
        </div>
      </SheetHeader>
      <div className="flex flex-col gap-7 py-2">
        {showFixedEvents ? (
          <ReportFixedEvents
            numberOfEvents={
              options?.type === 'sankey' && options.mode === 'between' ? 2 : 1
            }
          />
        ) : (
          <ReportSeries />
        )}
        <ReportGlobalFilters />
        {showBreakdown && <ReportBreakdowns />}
        {showHoldProperties && <ReportHoldProperties />}
        <ReportSettings />
      </div>
      <SheetFooter>
        <SheetClose asChild>
          <Button className="w-full">Done</Button>
        </SheetClose>
      </SheetFooter>
    </>
  );
}
