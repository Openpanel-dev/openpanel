import type { IServiceReport } from '@openpanel/core';
import { ShareIcon } from 'lucide-react';
import { useEffect } from 'react';
import EditReportName from '../report/edit-report-name';
import { ReportSummaryTrigger } from '../report/report-summary-trigger';
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
  setReport,
} from '@/components/report/reportSlice';
import { ReportSidebar } from '@/components/report/sidebar/ReportSidebar';
import { ReportChart } from '@/components/report-chart';
import { TimeWindowPicker } from '@/components/time-window-picker';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useAppParams } from '@/hooks/use-app-params';
import { pushModal } from '@/modals';
import { useDispatch, useSelector } from '@/redux';

const TOOLBAR_TRIGGER_CLASS =
  'h-8 rounded-md px-2.5 hover:bg-card hover:shadow-xs dark:hover:bg-def-400/60';

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
      <div>
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-4">
            <EditReportName />
            <div className="flex shrink-0 items-center gap-2">
              {initialReport?.id && (
                <Button
                  icon={ShareIcon}
                  onClick={() =>
                    pushModal('ShareReportModal', {
                      reportId: initialReport.id,
                    })
                  }
                  variant="outline"
                >
                  Share
                </Button>
              )}
              <ReportSaveButton />
            </div>
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <SheetTrigger asChild>
              <ReportSummaryTrigger className="max-w-full self-start md:self-auto" />
            </SheetTrigger>
            <div className="flex shrink-0 flex-wrap items-center gap-0.5 self-start rounded-lg bg-def-200 p-0.5 md:ml-auto md:self-auto dark:bg-def-300">
              <ReportChartType
                className={TOOLBAR_TRIGGER_CLASS}
                onChange={(type) => {
                  dispatch(changeChartType(type));
                }}
                size="sm"
                value={report.chartType}
                variant="ghost"
              />
              <TimeWindowPicker
                className={TOOLBAR_TRIGGER_CLASS}
                endDate={report.endDate}
                onChange={(value) => {
                  dispatch(changeDateRanges(value));
                }}
                onEndDateChange={(date) => dispatch(changeEndDate(date))}
                onIntervalChange={(interval) =>
                  dispatch(changeInterval(interval))
                }
                onStartDateChange={(date) => dispatch(changeStartDate(date))}
                size="sm"
                startDate={report.startDate}
                value={report.range}
                variant="ghost"
              />
              <ReportInterval
                chartType={report.chartType}
                className={TOOLBAR_TRIGGER_CLASS}
                endDate={report.endDate}
                interval={report.interval}
                onChange={(newInterval) =>
                  dispatch(changeInterval(newInterval))
                }
                range={report.range}
                size="sm"
                startDate={report.startDate}
                variant="ghost"
              />
              <ReportLineType
                className={TOOLBAR_TRIGGER_CLASS}
                size="sm"
                variant="ghost"
              />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-4 p-4 pt-0" id="report-editor">
          {report.ready && (
            <ReportChart isEditMode report={{ ...report, projectId }} />
          )}
        </div>
      </div>
      <SheetContent className="!max-w-lg" side="left">
        <ReportSidebar />
      </SheetContent>
    </Sheet>
  );
}
