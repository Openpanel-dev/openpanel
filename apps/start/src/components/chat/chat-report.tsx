import type {
  IChartRange,
  IChartType,
  IInterval,
  IReport,
} from '@openpanel/validation';
import { SaveIcon } from 'lucide-react';
import { useState } from 'react';
import { ReportChartType } from '../report/ReportChartType';
import { ReportInterval } from '../report/ReportInterval';
import { ReportChart } from '../report-chart';
import { TimeWindowPicker } from '../time-window-picker';
import { Button } from '../ui/button';
import { pushModal } from '@/modals';

export function ChatReport({
  lazy,
  ...props
}: {
  report: IReport & { startDate: string; endDate: string };
  lazy: boolean;
}) {
  const [chartType, setChartType] = useState<IChartType>(
    props.report.chartType
  );
  const [startDate, setStartDate] = useState<string>(props.report.startDate);
  const [endDate, setEndDate] = useState<string>(props.report.endDate);
  const [range, setRange] = useState<IChartRange>(props.report.range);
  const [interval, setInterval] = useState<IInterval>(props.report.interval);
  const report = {
    ...props.report,
    lineType: 'linear' as const,
    chartType,
    startDate: range === 'custom' ? startDate : null,
    endDate: range === 'custom' ? endDate : null,
    range,
    interval,
  };
  return (
    <div className="card">
      <div className="pt-4 text-center font-medium font-mono text-sm">
        {props.report.name}
      </div>
      <div className="p-4">
        <ReportChart lazy={lazy} report={report} />
      </div>
      <div className="row justify-between gap-1 border-border border-t p-2">
        <div className="col md:row gap-1">
          <TimeWindowPicker
            className="min-w-0"
            endDate={report.endDate}
            onChange={setRange}
            onEndDateChange={setEndDate}
            onIntervalChange={setInterval}
            onStartDateChange={setStartDate}
            startDate={report.startDate}
            value={report.range}
          />
          <ReportInterval
            chartType={chartType}
            className="min-w-0"
            interval={interval}
            onChange={setInterval}
            range={range}
          />
          <ReportChartType
            onChange={(type) => {
              setChartType(type);
            }}
            value={chartType}
          />
        </div>
        <Button
          icon={SaveIcon}
          onClick={() => {
            pushModal('SaveReport', {
              report,
              disableRedirect: true,
            });
          }}
          size="sm"
          variant="outline"
        >
          Save report
        </Button>
      </div>
    </div>
  );
}
