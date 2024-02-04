'use client';

import { useState } from 'react';
import { StickyBelowHeader } from '@/app/(app)/layout-sticky-below-header';
import { LazyChart } from '@/components/report/chart/LazyChart';
import { ReportRange } from '@/components/report/ReportRange';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAppParams } from '@/hooks/useAppParams';
import type { getReportsByDashboardId } from '@/server/services/reports.service';
import type { IChartRange } from '@/types';
import { cn } from '@/utils/cn';
import { getDefaultIntervalByRange, timeRanges } from '@/utils/constants';
import { ChevronRight, MoreHorizontal, PlusIcon, Trash } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface ListReportsProps {
  reports: Awaited<ReturnType<typeof getReportsByDashboardId>>;
}

export function ListReports({ reports }: ListReportsProps) {
  const router = useRouter();
  const params = useAppParams<{ dashboardId: string }>();
  const [range, setRange] = useState<null | IChartRange>(null);

  return (
    <>
      <StickyBelowHeader className="p-4 items-center justify-between flex">
        <ReportRange
          placeholder="Override range"
          value={range}
          onChange={(value) => setRange((p) => (p === value ? null : value))}
        />
        <Button
          icon={PlusIcon}
          onClick={() => {
            router.push(
              `/${params.organizationId}/${
                params.projectId
              }/reports?${new URLSearchParams({
                dashboardId: params.dashboardId,
              }).toString()}`
            );
          }}
        >
          <span className="max-sm:hidden">Create report</span>
          <span className="sm:hidden">Report</span>
        </Button>
      </StickyBelowHeader>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4">
        {reports.map((report) => {
          const chartRange = report.range; // timeRanges[report.range];
          return (
            <div
              className="rounded-md border border-border bg-white shadow"
              key={report.id}
            >
              <Link
                href={`/${params.organizationId}/${params.projectId}/reports/${report.id}`}
                className="flex border-b border-border p-4 leading-none [&_svg]:hover:opacity-100 items-center justify-between"
                shallow
              >
                <div>
                  <div className="font-medium">{report.name}</div>
                  {chartRange !== null && (
                    <div className="mt-2 text-sm flex gap-2">
                      <span className={range !== null ? 'line-through' : ''}>
                        {chartRange}
                      </span>
                      {range !== null && <span>{range}</span>}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <DropdownMenu>
                    <DropdownMenuTrigger className="h-8 w-8 hover:border rounded justify-center items-center flex">
                      <MoreHorizontal size={16} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[200px]">
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(event) => {
                            // event.stopPropagation();
                            // deletion.mutate({
                            //   reportId: report.id,
                            // });
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
                className={cn(
                  'p-4 pl-2',
                  report.chartType === 'bar' && 'overflow-auto max-h-[300px]'
                )}
              >
                <LazyChart
                  {...report}
                  range={range ?? report.range}
                  interval={
                    range ? getDefaultIntervalByRange(range) : report.interval
                  }
                  editMode={false}
                />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
