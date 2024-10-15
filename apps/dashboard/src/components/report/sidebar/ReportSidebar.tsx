import { Button } from '@/components/ui/button';
import { SheetClose, SheetFooter } from '@/components/ui/sheet';
import { useSelector } from '@/redux';

import { ReportBreakdowns } from './ReportBreakdowns';
import { ReportEvents } from './ReportEvents';
import { ReportFormula } from './ReportFormula';
import { ReportSettings } from './ReportSettings';

export function ReportSidebar() {
  const { chartType } = useSelector((state) => state.report);
  const showFormula = chartType !== 'funnel' && chartType !== 'retention';
  const showBreakdown = chartType !== 'funnel' && chartType !== 'retention';
  return (
    <>
      <div className="flex flex-col gap-8">
        <ReportEvents />
        <ReportSettings />
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
