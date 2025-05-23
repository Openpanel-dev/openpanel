'use client';

import { pushModal } from '@/modals';
import type {
  IChartInputAi,
  IChartRange,
  IChartType,
  IInterval,
} from '@openpanel/validation';
import { SaveIcon } from 'lucide-react';
import { useState } from 'react';
import { ReportChart } from '../report-chart';
import { ReportChartType } from '../report/ReportChartType';
import { ReportInterval } from '../report/ReportInterval';
import { TimeWindowPicker } from '../time-window-picker';
import { Button } from '../ui/button';

export function ChatReport({
  lazy,
  ...props
}: { report: IChartInputAi; lazy: boolean }) {
  const [chartType, setChartType] = useState<IChartType>(
    props.report.chartType,
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
      <div className="text-center text-sm font-mono font-medium pt-4">
        {props.report.name}
      </div>
      <div className="p-4">
        <ReportChart lazy={lazy} report={report} />
      </div>
      <div className="row justify-between gap-1 border-t border-border p-2">
        <div className="col md:row gap-1">
          <TimeWindowPicker
            className="min-w-0"
            onChange={setRange}
            value={report.range}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            endDate={report.endDate}
            startDate={report.startDate}
          />
          <ReportInterval
            className="min-w-0"
            interval={interval}
            range={range}
            chartType={chartType}
            onChange={setInterval}
          />
          <ReportChartType
            value={chartType}
            onChange={(type) => {
              setChartType(type);
            }}
          />
        </div>
        <Button
          icon={SaveIcon}
          variant="outline"
          size="sm"
          onClick={() => {
            pushModal('SaveReport', {
              report,
              disableRedirect: true,
            });
          }}
        >
          Save report
        </Button>
      </div>
    </div>
  );
}
