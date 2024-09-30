import { Button } from '@/components/ui/button';
import { SheetClose, SheetFooter } from '@/components/ui/sheet';
import { useSelector } from '@/redux';

import { ReportBreakdowns } from './ReportBreakdowns';
import { ReportEvents } from './ReportEvents';
import { ReportFormula } from './ReportFormula';

export function ReportSidebar() {
  const { chartType } = useSelector((state) => state.report);
  const showFormula = chartType !== 'funnel';
  const showBreakdown = chartType !== 'funnel';
  return (
    <>
      <div className="flex flex-col gap-8">
        <ReportEvents />
        {showFormula && <ReportFormula />}
        {showBreakdown && <ReportBreakdowns />}
      </div>
      <SheetFooter>
        <SheetClose asChild>
          <Button className="w-full">Done</Button>
        </SheetClose>
      </SheetFooter>
    </>
  );
}
