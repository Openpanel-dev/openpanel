'use client';

import { useEffect, useRef } from 'react';
import { api } from '@/app/_trpc/client';
import { StickyBelowHeader } from '@/app/(app)/layout-sticky-below-header';
import { Chart } from '@/components/report/chart';
import { ReportChartType } from '@/components/report/ReportChartType';
import { ReportInterval } from '@/components/report/ReportInterval';
import { ReportLineType } from '@/components/report/ReportLineType';
import { ReportSaveButton } from '@/components/report/ReportSaveButton';
import {
  changeDateRanges,
  ready,
  reset,
  setReport,
} from '@/components/report/reportSlice';
import { ReportSidebar } from '@/components/report/sidebar/ReportSidebar';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useDispatch, useSelector } from '@/redux';
import type { IServiceReport } from '@/server/services/reports.service';
import { timeRanges } from '@/utils/constants';
import { GanttChartSquareIcon } from 'lucide-react';

interface ReportEditorProps {
  report: IServiceReport | null;
}

export default function ReportEditor({
  report: initialReport,
}: ReportEditorProps) {
  const dispatch = useDispatch();
  const report = useSelector((state) => state.report);

  // Set report if reportId exists
  useEffect(() => {
    if (initialReport) {
      dispatch(setReport(initialReport));
    } else {
      dispatch(ready());
    }

    return () => {
      dispatch(reset());
    };
  }, [initialReport, dispatch]);

  return (
    <Sheet>
      <StickyBelowHeader className="p-4 grid grid-cols-2 gap-2 md:grid-cols-6">
        <SheetTrigger asChild>
          <div>
            <Button icon={GanttChartSquareIcon} variant="cta">
              Pick events
            </Button>
          </div>
        </SheetTrigger>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 col-span-4">
          <ReportChartType className="min-w-0 flex-1" />
          <Combobox
            className="min-w-0 flex-1"
            placeholder="Range"
            value={report.range}
            onChange={(value) => {
              dispatch(changeDateRanges(value));
            }}
            items={Object.values(timeRanges).map((key) => ({
              label: key,
              value: key,
            }))}
          />
          <ReportInterval className="min-w-0 flex-1" />
          <ReportLineType className="min-w-0 flex-1" />
        </div>
        <div className="col-start-2 md:col-start-6 row-start-1 text-right">
          <ReportSaveButton />
        </div>
      </StickyBelowHeader>
      <div className="flex flex-col gap-4 p-4">
        {report.ready && <Chart {...report} editMode />}
      </div>
      <SheetContent className="!max-w-lg w-full" side="left">
        <ReportSidebar />
      </SheetContent>
    </Sheet>
  );
}
