import { Button } from '@/components/ui/button';
import { SheetClose, SheetFooter } from '@/components/ui/sheet';
import { useSelector } from '@/redux';

import { ReportBreakdowns } from './ReportBreakdowns';
import { ReportSeries } from './ReportSeries';
import { ReportSettings } from './ReportSettings';
import { ReportFixedEvents } from './report-fixed-events';

export function ReportSidebar() {
  const { chartType, options } = useSelector((state) => state.report);
  const showBreakdown = chartType !== 'retention' && chartType !== 'sankey';
  const showFixedEvents = chartType === 'sankey';
  return (
    <>
      <div className="flex flex-col gap-8">
        {showFixedEvents ? (
          <ReportFixedEvents
            numberOfEvents={
              options?.type === 'sankey' && options.mode === 'between' ? 2 : 1
            }
          />
        ) : (
          <ReportSeries />
        )}
        {showBreakdown && <ReportBreakdowns />}
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
