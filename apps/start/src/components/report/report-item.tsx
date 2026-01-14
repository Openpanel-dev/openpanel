import { ReportChart } from '@/components/report-chart';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/utils/cn';
import { CopyIcon, MoreHorizontal, Trash } from 'lucide-react';

import { timeWindows } from '@openpanel/constants';

import { useRouter } from '@tanstack/react-router';

export function ReportItemSkeleton() {
  return (
    <div className="card h-full flex flex-col animate-pulse">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex-1">
          <div className="h-5 w-32 bg-muted rounded mb-2" />
          <div className="h-4 w-24 bg-muted/50 rounded" />
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-muted rounded" />
          <div className="w-8 h-8 bg-muted rounded" />
        </div>
      </div>
      <div className="p-4 flex-1 flex items-center justify-center aspect-video" />
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
}) {
  const router = useRouter();
  const chartRange = report.range;

  return (
    <div className="card h-full flex flex-col">
      <div className="flex items-center hover:bg-muted/50 justify-between border-b border-border p-4 leading-none [&_svg]:hover:opacity-100">
        <div
          className="flex-1 cursor-pointer -m-4 p-4"
          onClick={(event) => {
            if (event.metaKey) {
              window.open(
                `/${organizationId}/${projectId}/reports/${report.id}`,
                '_blank',
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
            <div className="mt-2 flex gap-2 ">
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
          <div className="drag-handle cursor-move p-2 hover:bg-muted rounded">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="opacity-30 hover:opacity-100"
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
                <CopyIcon size={16} className="mr-2" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuGroup>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(report.id);
                  }}
                >
                  <Trash size={16} className="mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div
        className={cn(
          'p-4 overflow-auto flex-1',
          report.chartType === 'metric' && 'p-0',
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
    <div className="card h-full flex flex-col">
      <div className="flex items-center justify-between border-b border-border p-4 leading-none">
        <div className="flex-1">
          <div className="font-medium">{report.name}</div>
          {chartRange !== null && (
            <div className="mt-2 flex gap-2 ">
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
          'p-4 overflow-auto flex-1',
          report.chartType === 'metric' && 'p-0',
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
