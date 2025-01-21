'use client';

import { FullPageEmptyState } from '@/components/full-page-empty-state';
import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { ReportChart } from '@/components/report-chart';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAppParams } from '@/hooks/useAppParams';
import { api, handleError } from '@/trpc/client';
import { cn } from '@/utils/cn';
import {
  ChevronRight,
  LayoutPanelTopIcon,
  MoreHorizontal,
  PlusIcon,
  Trash,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import {
  getDefaultIntervalByDates,
  getDefaultIntervalByRange,
  timeWindows,
} from '@openpanel/constants';
import type { IServiceDashboard, getReportsByDashboardId } from '@openpanel/db';

import { OverviewInterval } from '@/components/overview/overview-interval';
import { OverviewRange } from '@/components/overview/overview-range';

interface ListReportsProps {
  reports: Awaited<ReturnType<typeof getReportsByDashboardId>>;
  dashboard: IServiceDashboard;
}

export function ListReports({ reports, dashboard }: ListReportsProps) {
  const router = useRouter();
  const params = useAppParams<{ dashboardId: string }>();
  const { range, startDate, endDate, interval } = useOverviewOptions();
  const deletion = api.report.delete.useMutation({
    onError: handleError,
    onSuccess() {
      router.refresh();
      toast('Report deleted');
    },
  });
  return (
    <>
      <div className="row mb-4 items-center justify-between">
        <h1 className="text-3xl font-semibold">{dashboard.name}</h1>
        <div className="flex items-center justify-end gap-2">
          <OverviewRange />
          <OverviewInterval />
          <Button
            icon={PlusIcon}
            onClick={() => {
              router.push(
                `/${params.organizationId}/${
                  params.projectId
                }/reports?${new URLSearchParams({
                  dashboardId: params.dashboardId,
                }).toString()}`,
              );
            }}
          >
            <span className="max-sm:hidden">Create report</span>
            <span className="sm:hidden">Report</span>
          </Button>
        </div>
      </div>
      <div className="flex max-w-6xl flex-col gap-8">
        {reports.map((report) => {
          const chartRange = report.range;
          return (
            <div className="card" key={report.id}>
              <Link
                href={`/${params.organizationId}/${params.projectId}/reports/${report.id}`}
                className="flex items-center justify-between border-b border-border p-4 leading-none [&_svg]:hover:opacity-100"
                shallow
              >
                <div>
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
                        {timeWindows[chartRange].label}
                      </span>
                      {startDate && endDate ? (
                        <span>Custom dates</span>
                      ) : (
                        range !== null &&
                        chartRange !== range && (
                          <span>{timeWindows[range].label}</span>
                        )
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <DropdownMenu>
                    <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded hover:border">
                      <MoreHorizontal size={16} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[200px]">
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(event) => {
                            event.stopPropagation();
                            deletion.mutate({
                              reportId: report.id,
                            });
                          }}
                        >
                          <Trash size={16} className="mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <ChevronRight
                    className="opacity-10 transition-opacity"
                    size={16}
                  />
                </div>
              </Link>
              <div
                className={cn('p-4', report.chartType === 'metric' && 'p-0')}
              >
                <ReportChart
                  {...report}
                  report={{
                    ...report,
                    range: range ?? report.range,
                    startDate: startDate ?? report.startDate,
                    endDate: endDate ?? report.endDate,
                    interval: interval ?? report.interval,
                  }}
                />
              </div>
            </div>
          );
        })}
        {reports.length === 0 && (
          <FullPageEmptyState title="No reports" icon={LayoutPanelTopIcon}>
            <p>You can visualize your data with a report</p>
            <Button
              onClick={() =>
                router.push(
                  `/${params.organizationId}/${
                    params.projectId
                  }/reports?${new URLSearchParams({
                    dashboardId: params.dashboardId,
                  }).toString()}`,
                )
              }
              className="mt-14"
              icon={PlusIcon}
            >
              Create report
            </Button>
          </FullPageEmptyState>
        )}
      </div>
    </>
  );
}
