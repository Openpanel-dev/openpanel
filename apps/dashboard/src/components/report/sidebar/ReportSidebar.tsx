import { Button } from '@/components/ui/button';
import { SheetClose, SheetFooter } from '@/components/ui/sheet';
import { useSelector } from '@/redux';

import { ReportBreakdowns } from './ReportBreakdowns';
import { ReportEvents } from './ReportEvents';
import { ReportForumula } from './ReportForumula';

export function ReportSidebar() {
  const { chartType } = useSelector((state) => state.report);
  const showForumula = chartType !== 'funnel';
  const showBreakdown = chartType !== 'funnel';
  return (
    <>
      <div className="flex flex-col gap-8">
        <ReportEvents />
        {showForumula && <ReportForumula />}
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
