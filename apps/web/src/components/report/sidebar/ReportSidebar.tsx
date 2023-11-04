import { Button } from '@/components/ui/button';
import { SheetClose } from '@/components/ui/sheet';

import { ReportBreakdowns } from './ReportBreakdowns';
import { ReportEvents } from './ReportEvents';

export function ReportSidebar() {
  return (
    <div className="flex flex-col gap-8">
      <ReportEvents />
      <ReportBreakdowns />
      <SheetClose asChild>
        <Button>Done</Button>
      </SheetClose>
    </div>
  );
}
