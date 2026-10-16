import { timeWindows } from '@openpanel/core/modules/report/report.constants';
import { useRouter } from '@tanstack/react-router';
import {
  CopyIcon,
  LayoutPanelTopIcon,
  MoreHorizontal,
  Trash,
} from 'lucide-react';
import { ReportChart } from '@/components/report-chart';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/utils/cn';

export function ReportItemSkeleton() {
  return (
    <div className="card flex h-full animate-pulse flex-col">
      <div className="flex items-center justify-between border-border border-b p-4">
        <div className="flex-1">
          <div className="mb-2 h-5 w-32 rounded bg-muted" />
          <div className="h-4 w-24 rounded bg-muted/50" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded bg-muted" />
          <div className="h-8 w-8 rounded bg-muted" />
        </div>
      </div>
      <div className="flex aspect-video flex-1 items-center justify-center p-4" />
    </div>
  );
}

export function ReportItem({
  report,
  organizationId,
  projectId,
  range,
  startDate,
  endDate,
  interval,
  onDelete,
  onDuplicate,
  onMove,
}: {
  report: any;
  organizationId: string;
  projectId: string;
  range: any;
  startDate: any;
  endDate: any;
  interval: any;
  onDelete: (reportId: string) => void;
  onDuplicate: (reportId: string) => void;
  onMove?: (reportId: string) => void;
}) {
  const router = useRouter();
  const chartRange = report.range;

  return (
    <div className="card flex h-full flex-col">
      <div className="flex items-center justify-between border-border border-b p-4 leading-none hover:bg-muted/50 [&_svg]:hover:opacity-100">
        <div
          className="-m-4 flex-1 cursor-pointer p-4"
          onClick={(event) => {
            if (event.metaKey) {
              window.open(
                `/${organizationId}/${projectId}/reports/${report.id}`,
                '_blank'
              );
              return;
            }
            router.navigate({
              to: '/$organizationId/$projectId/reports/$reportId',
              params: {
                organizationId,
                projectId,
                reportId: report.id,
              },
            });
          }}
          onKeyUp={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              router.navigate({
                to: '/$organizationId/$projectId/reports/$reportId',
                params: {
                  organizationId,
                  projectId,
                  reportId: report.id,
                },
              });
            }
          }}
          role="button"
          tabIndex={0}
        >
          <div className="font-medium">{report.name}</div>
          {chartRange !== null && (
            <div className="mt-2 flex gap-2">
              <span
                className={
                  (chartRange !== range && range !== null) ||
                  (startDate && endDate)
                    ? 'line-through'
                    : ''
                }
              >
                {timeWindows[chartRange as keyof typeof timeWindows]?.label}
              </span>
              {startDate && endDate ? (
                <span>Custom dates</span>
              ) : (
                range !== null &&
                chartRange !== range && (
                  <span>
                    {timeWindows[range as keyof typeof timeWindows]?.label}
                  </span>
                )
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="drag-handle cursor-move rounded p-2 hover:bg-muted">
            <svg
              className="opacity-30 hover:opacity-100"
              fill="currentColor"
              height="16"
              viewBox="0 0 16 16"
              width="16"
            >
              <circle cx="4" cy="4" r="1.5" />
              <circle cx="4" cy="8" r="1.5" />
              <circle cx="4" cy="12" r="1.5" />
              <circle cx="12" cy="4" r="1.5" />
              <circle cx="12" cy="8" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
            </svg>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded hover:border">
              <MoreHorizontal size={16} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[200px]">
              <DropdownMenuItem
                onClick={(event) => {
                  event.stopPropagation();
                  onDuplicate(report.id);
                }}
              >
                <CopyIcon className="mr-2" size={16} />
                Duplicate
              </DropdownMenuItem>
              {onMove && (
                <DropdownMenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    onMove(report.id);
                  }}
                >
                  <LayoutPanelTopIcon className="mr-2" size={16} />
                  Move to dashboard
                </DropdownMenuItem>
              )}
              <DropdownMenuGroup>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(report.id);
                  }}
                >
                  <Trash className="mr-2" size={16} />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div
        className={cn(
          'flex-1 overflow-auto p-4',
          report.chartType === 'metric' && 'p-0'
        )}
      >
        <ReportChart
          report={{
            ...report,
            range: range ?? report.range,
            startDate: startDate ?? null,
            endDate: endDate ?? null,
            interval: interval ?? report.interval,
          }}
        />
      </div>
    </div>
  );
}

export function ReportItemReadOnly({
  report,
  shareId,
  range,
  startDate,
  endDate,
  interval,
}: {
  report: any;
  shareId: string;
  range: any;
  startDate: any;
  endDate: any;
  interval: any;
}) {
  const chartRange = report.range;

  return (
    <div className="card flex h-full flex-col">
      <div className="flex items-center justify-between border-border border-b p-4 leading-none">
        <div className="flex-1">
          <div className="font-medium">{report.name}</div>
          {chartRange !== null && (
            <div className="mt-2 flex gap-2">
              <span
                className={
                  (chartRange !== range && range !== null) ||
                  (startDate && endDate)
                    ? 'line-through'
                    : ''
                }
              >
                {timeWindows[chartRange as keyof typeof timeWindows]?.label}
              </span>
              {startDate && endDate ? (
                <span>Custom dates</span>
              ) : (
                range !== null &&
                chartRange !== range && (
                  <span>
                    {timeWindows[range as keyof typeof timeWindows]?.label}
                  </span>
                )
              )}
            </div>
          )}
        </div>
      </div>
      <div
        className={cn(
          'flex-1 overflow-auto p-4',
          report.chartType === 'metric' && 'p-0'
        )}
      >
        <ReportChart
          report={{
            ...report,
            range: range ?? report.range,
            startDate: startDate ?? null,
            endDate: endDate ?? null,
            interval: interval ?? report.interval,
          }}
          shareId={shareId}
        />
      </div>
    </div>
  );
}
