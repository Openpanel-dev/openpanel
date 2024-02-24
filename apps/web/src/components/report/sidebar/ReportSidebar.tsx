import { Button } from '@/components/ui/button';
import { SheetClose } from '@/components/ui/sheet';
import { useSelector } from '@/redux';

import { ReportBreakdowns } from './ReportBreakdowns';
import { ReportEvents } from './ReportEvents';
import { ReportForumula } from './ReportForumula';

export function ReportSidebar() {
  const { chartType } = useSelector((state) => state.report);
  const showForumula = chartType !== 'funnel';
  const showBreakdown = chartType !== 'funnel';
  return (
    <div className="flex flex-col gap-8 pb-12">
      <ReportEvents />
      {showForumula && <ReportForumula />}
      {showBreakdown && <ReportBreakdowns />}
      <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-white/100 to-white/0">
        <SheetClose asChild>
          <Button className="w-full">Done</Button>
        </SheetClose>
      </div>
    </div>
  );
}
