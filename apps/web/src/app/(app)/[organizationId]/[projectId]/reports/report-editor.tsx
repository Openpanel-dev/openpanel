'use client';

import { useEffect } from 'react';
import { StickyBelowHeader } from '@/app/(app)/[organizationId]/[projectId]/layout-sticky-below-header';
import { Chart } from '@/components/report/chart';
import { ReportChartType } from '@/components/report/ReportChartType';
import { ReportInterval } from '@/components/report/ReportInterval';
import { ReportLineType } from '@/components/report/ReportLineType';
import { ReportRange } from '@/components/report/ReportRange';
import { ReportSaveButton } from '@/components/report/ReportSaveButton';
import {
  changeDateRanges,
  ready,
  reset,
  setReport,
} from '@/components/report/reportSlice';
import { ReportSidebar } from '@/components/report/sidebar/ReportSidebar';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useAppParams } from '@/hooks/useAppParams';
import { useDispatch, useSelector } from '@/redux';
import { GanttChartSquareIcon } from 'lucide-react';

import type { IServiceReport } from '@mixan/db';

interface ReportEditorProps {
  report: IServiceReport | null;
}

export default function ReportEditor({
  report: initialReport,
}: ReportEditorProps) {
  const { projectId } = useAppParams();
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
          <ReportRange
            className="min-w-0 flex-1"
            value={report.range}
            onChange={(value) => {
              dispatch(changeDateRanges(value));
            }}
          />
          <ReportInterval className="min-w-0 flex-1" />
          <ReportLineType className="min-w-0 flex-1" />
        </div>
        <div className="col-start-2 md:col-start-6 row-start-1 text-right">
          <ReportSaveButton />
        </div>
      </StickyBelowHeader>
      <div className="flex flex-col gap-4 p-4">
        {report.ready && <Chart {...report} projectId={projectId} editMode />}
      </div>
      <SheetContent className="!max-w-lg w-full" side="left">
        <ReportSidebar />
      </SheetContent>
    </Sheet>
  );
}
