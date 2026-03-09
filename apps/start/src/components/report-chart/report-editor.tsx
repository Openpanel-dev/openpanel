import type { IServiceReport } from '@openpanel/db';
import { GanttChartSquareIcon, ShareIcon } from 'lucide-react';
import { useEffect } from 'react';
import EditReportName from '../report/edit-report-name';
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
        <div className="flex items-center justify-between p-4">
          <EditReportName />
          {initialReport?.id && (
            <Button
              icon={ShareIcon}
              onClick={() =>
                pushModal('ShareReportModal', { reportId: initialReport.id })
              }
              variant="outline"
            >
              Share
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 p-4 pt-0 md:grid-cols-6">
          <SheetTrigger asChild>
            <Button
              className="self-start"
              icon={GanttChartSquareIcon}
              variant="cta"
            >
              Pick events
            </Button>
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
              endDate={report.endDate}
              onChange={(value) => {
                dispatch(changeDateRanges(value));
              }}
              onEndDateChange={(date) => dispatch(changeEndDate(date))}
              onIntervalChange={(interval) =>
                dispatch(changeInterval(interval))
              }
              onStartDateChange={(date) => dispatch(changeStartDate(date))}
              startDate={report.startDate}
              value={report.range}
            />
            <ReportInterval
              chartType={report.chartType}
              className="min-w-0 flex-1"
              endDate={report.endDate}
              interval={report.interval}
              onChange={(newInterval) => dispatch(changeInterval(newInterval))}
              range={report.range}
              startDate={report.startDate}
            />
            <ReportLineType className="min-w-0 flex-1" />
          </div>
          <div className="col-start-2 row-start-1 text-right md:col-start-6">
            <ReportSaveButton />
          </div>
        </div>
        <div className="flex flex-col gap-4 p-4" id="report-editor">
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
