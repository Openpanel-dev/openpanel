import { Button } from '@/components/ui/button';
import { SheetClose, SheetFooter } from '@/components/ui/sheet';
import { useSelector } from '@/redux';

import { ReportBreakdowns } from './ReportBreakdowns';
import { ReportSeries } from './ReportSeries';
import { ReportSettings } from './ReportSettings';

export function ReportSidebar() {
  const { chartType } = useSelector((state) => state.report);
  const showBreakdown = chartType !== 'retention';
  return (
    <>
      <div className="flex flex-col gap-8">
        <ReportSeries />
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
