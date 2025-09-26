'use client';

import { StickyBelowHeader } from '@/app/(app)/[organizationSlug]/[projectId]/layout-sticky-below-header';
import { ReportChart } from '@/components/report-chart';
import { ReportChartType } from '@/components/report/ReportChartType';
import { ReportInterval } from '@/components/report/ReportInterval';
import { ReportLineType } from '@/components/report/ReportLineType';
import { ReportSaveButton } from '@/components/report/ReportSaveButton';
import {
  changeChartType,
  changeDateRanges,
  changeEndDate,
  changeInterval,
  changeStartDate,
  ready,
  reset,
  setName,
  setReport,
} from '@/components/report/reportSlice';
import { ReportSidebar } from '@/components/report/sidebar/ReportSidebar';
import { TimeWindowPicker } from '@/components/time-window-picker';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useAppParams } from '@/hooks/useAppParams';
import { useDispatch, useSelector } from '@/redux';
import { bind } from 'bind-event-listener';
import { GanttChartSquareIcon } from 'lucide-react';
import { useEffect } from 'react';

import type { IServiceReport } from '@openpanel/db';

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

  useEffect(() => {
    return bind(window, {
      type: 'report-name-change',
      listener: (event) => {
        if (event instanceof CustomEvent && typeof event.detail === 'string') {
          dispatch(setName(event.detail));
        }
      },
    });
  }, [dispatch]);

  return (
    <Sheet>
      <StickyBelowHeader className="grid grid-cols-2 gap-2 p-4 md:grid-cols-6">
        <SheetTrigger asChild>
          <div>
            <Button icon={GanttChartSquareIcon} variant="cta">
              Pick events
            </Button>
          </div>
        </SheetTrigger>
        <div className="col-span-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          <ReportChartType
            className="min-w-0 flex-1"
            onChange={(type) => {
              dispatch(changeChartType(type));
            }}
            value={report.chartType}
          />
          <TimeWindowPicker
            className="min-w-0 flex-1"
            onChange={(value) => {
              dispatch(changeDateRanges(value));
            }}
            value={report.range}
            onStartDateChange={(date) => dispatch(changeStartDate(date))}
            onEndDateChange={(date) => dispatch(changeEndDate(date))}
            endDate={report.endDate}
            startDate={report.startDate}
          />
          <ReportInterval
            className="min-w-0 flex-1"
            interval={report.interval}
            onChange={(newInterval) => dispatch(changeInterval(newInterval))}
            range={report.range}
            chartType={report.chartType}
          />
          <ReportLineType className="min-w-0 flex-1" />
        </div>
        <div className="col-start-2 row-start-1 text-right md:col-start-6">
          <ReportSaveButton />
        </div>
      </StickyBelowHeader>
      <div className="flex flex-col gap-4 p-4" id="report-editor">
        {report.ready && (
          <ReportChart report={{ ...report, projectId }} isEditMode />
        )}
      </div>
      <SheetContent className="!max-w-lg" side="left">
        <ReportSidebar />
      </SheetContent>
    </Sheet>
  );
}
