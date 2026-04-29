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
import { useAppParams } from '@/hooks/use-app-params';
import { useDispatch, useSelector } from '@/redux';
import { useTRPC } from '@/integrations/trpc/react';
import { bind } from 'bind-event-listener';
import { BellIcon, BellPlusIcon, GanttChartSquareIcon } from 'lucide-react';
import { useEffect, useMemo } from 'react';

import type { IServiceReport } from '@openpanel/db';
import { useParams, useSearch } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { pushModal } from '@/modals';
import EditReportName from '../report/edit-report-name';

interface ReportEditorProps {
  report: IServiceReport | null;
}

export default function ReportEditor({
  report: initialReport,
}: ReportEditorProps) {
  const { projectId } = useAppParams();
  const { reportId } = useParams({ strict: false });
  const search = useSearch({ strict: false });
  const rangeOverride = (search as { range?: string }).range;
  const dispatch = useDispatch();
  const report = useSelector((state) => state.report);
  const trpc = useTRPC();

  const { data: notificationRules } = useQuery({
    ...trpc.notification.rules.queryOptions({ projectId }),
    enabled: !!reportId,
  });

  const existingRule = useMemo(() => {
    if (!reportId || !notificationRules) return undefined;
    return notificationRules.find((rule) => {
      const config = rule.config as { type: string; reportId?: string };
      return (
        (config.type === 'threshold' || config.type === 'anomaly') &&
        config.reportId === reportId
      );
    });
  }, [reportId, notificationRules]);

  // Set report if reportId exists, applying URL range override in one shot
  useEffect(() => {
    if (initialReport) {
      dispatch(setReport(
        rangeOverride
          ? { ...initialReport, range: rangeOverride as any }
          : initialReport
      ));
    } else {
      dispatch(ready());
    }

    return () => {
      dispatch(reset());
    };
  }, [initialReport, dispatch, rangeOverride]);

  return (
    <Sheet>
      <div>
        <div className="p-4">
          <EditReportName />
        </div>
        <div className="grid grid-cols-2 gap-2 p-4 pt-0 md:grid-cols-6">
          <SheetTrigger asChild>
            <Button
              icon={GanttChartSquareIcon}
              variant="cta"
              className="self-start"
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
              startDate={report.startDate}
              endDate={report.endDate}
            />
            <ReportLineType className="min-w-0 flex-1" />
          </div>
          <div className="col-start-2 row-start-1 text-right md:col-start-6 row gap-2 justify-end flex-nowrap whitespace-nowrap">
            {reportId && (
              existingRule ? (
                <Button
                  icon={BellIcon}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    pushModal('AddNotificationRule', {
                      rule: existingRule,
                    });
                  }}
                >
                  Manage
                </Button>
              ) : (
                <Button
                  icon={BellPlusIcon}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    pushModal('AddNotificationRule', {
                      reportId,
                      projectId,
                    });
                  }}
                >
                  Add Alert
                </Button>
              )
            )}
            <ReportSaveButton />
          </div>
        </div>
        <div className="flex flex-col gap-4 p-4" id="report-editor">
          {report.ready && (
            <ReportChart report={{ ...report, projectId }} isEditMode />
          )}
        </div>
      </div>
      <SheetContent className="!max-w-lg" side="left">
        <ReportSidebar />
      </SheetContent>
    </Sheet>
  );
}
