import type { IReport } from '@openpanel/core/modules/report/report.constants';
import {
  ExternalLinkIcon,
  MaximizeIcon,
  MinimizeIcon,
  SaveIcon,
} from 'lucide-react';
import { useState } from 'react';
import type { ChartOutput } from '../types';
import { ReportChart } from '@/components/report-chart';
import { Button } from '@/components/ui/button';
import { pushModal } from '@/modals';
import { cn } from '@/utils/cn';

const DATE_LENGTH = 10;

function rangeCaption(report: ChartOutput['report']): string {
  const start = report.startDate?.slice(0, DATE_LENGTH);
  const end = report.endDate?.slice(0, DATE_LENGTH);
  if (start && end) {
    return `${start} to ${end}, by ${report.interval}`;
  }
  return `${report.range}, by ${report.interval}`;
}

/** A chart inline in the conversation: compact by default, expandable, saveable. */
export function ChartCard({ output }: { output: ChartOutput }) {
  const [expanded, setExpanded] = useState(false);
  const { report } = output;
  const isMetric = report.chartType === 'metric';

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-start justify-between gap-2 px-4 pt-3 pb-1">
        <div className="min-w-0">
          <div className="truncate font-medium">{output.title}</div>
          <div className="text-muted-foreground text-xs">
            {rangeCaption(report)}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {output.dashboardUrl && (
            <Button
              aria-label="Open report"
              asChild
              className="size-7"
              size="icon"
              variant="ghost"
            >
              <a
                href={output.dashboardUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                <ExternalLinkIcon className="size-3.5" />
              </a>
            </Button>
          )}
          {!report.id && (
            <Button
              aria-label="Save to dashboard"
              className="size-7"
              onClick={() =>
                pushModal('SaveReport', {
                  report: {
                    ...report,
                    name: output.title,
                  } as unknown as IReport,
                  disableRedirect: true,
                })
              }
              size="icon"
              variant="ghost"
            >
              <SaveIcon className="size-3.5" />
            </Button>
          )}
          {!isMetric && (
            <Button
              aria-label={expanded ? 'Shrink chart' : 'Expand chart'}
              className="size-7"
              onClick={() => setExpanded((value) => !value)}
              size="icon"
              variant="ghost"
            >
              {expanded ? (
                <MinimizeIcon className="size-3.5" />
              ) : (
                <MaximizeIcon className="size-3.5" />
              )}
            </Button>
          )}
        </div>
      </div>
      <div className={cn('px-2 pb-2', isMetric && 'px-4 pb-4')}>
        <ReportChart
          lazy={false}
          options={{
            hideTable: !expanded,
            hideLegend: false,
            minHeight: expanded ? 360 : 220,
            maxHeight: expanded ? 520 : 300,
          }}
          report={report}
        />
      </div>
    </div>
  );
}
