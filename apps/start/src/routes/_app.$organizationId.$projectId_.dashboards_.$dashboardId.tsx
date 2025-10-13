import { FullPageEmptyState } from '@/components/full-page-empty-state';
import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { ReportChart } from '@/components/report-chart';
import { LinkButton } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/utils/cn';
import { createProjectTitle } from '@/utils/title';
import {
  ChevronRight,
  LayoutPanelTopIcon,
  MoreHorizontal,
  PlusIcon,
  Trash,
} from 'lucide-react';
import { toast } from 'sonner';

import { timeWindows } from '@openpanel/constants';

import FullPageLoadingState from '@/components/full-page-loading-state';
import { OverviewInterval } from '@/components/overview/overview-interval';
import { OverviewRange } from '@/components/overview/overview-range';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { handleErrorToastOptions, useTRPC } from '@/integrations/trpc/react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute, useRouter } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId_/dashboards_/$dashboardId',
)({
  component: Component,
  head: () => {
    return {
      meta: [
        {
          title: createProjectTitle('Dashboard'),
        },
      ],
    };
  },
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.prefetchQuery(
        context.trpc.dashboard.byId.queryOptions({
          id: params.dashboardId,
          projectId: params.projectId,
        }),
      ),
      context.queryClient.prefetchQuery(
        context.trpc.report.list.queryOptions({
          dashboardId: params.dashboardId,
          projectId: params.projectId,
        }),
      ),
      context.queryClient.prefetchQuery(
        context.trpc.project.getProjectWithClients.queryOptions({
          projectId: params.projectId,
        }),
      ),
      context.queryClient.prefetchQuery(
        context.trpc.organization.get.queryOptions({
          organizationId: params.organizationId,
        }),
      ),
    ]);
  },
  pendingComponent: FullPageLoadingState,
});

function Component() {
  const router = useRouter();
  const { organizationId, dashboardId, projectId } = Route.useParams();
  const trpc = useTRPC();
  const { range, startDate, endDate, interval } = useOverviewOptions();

  const dashboardQuery = useQuery(
    trpc.dashboard.byId.queryOptions({
      id: dashboardId,
      projectId,
    }),
  );

  const reportsQuery = useQuery(
    trpc.report.list.queryOptions({
      dashboardId,
      projectId,
    }),
  );

  const reports = reportsQuery.data ?? [];
  const dashboard = dashboardQuery.data;

  const deletion = useMutation(
    trpc.report.delete.mutationOptions({
      onError: handleErrorToastOptions({}),
      onSuccess() {
        reportsQuery.refetch();
        toast('Report deleted');
      },
    }),
  );

  if (!dashboard) {
    return null; // Loading handled by suspense
  }

  return (
    <PageContainer>
      <div className="row mb-4 items-center justify-between">
        <PageHeader
          title={dashboard.name}
          description="View and manage your reports"
          className="mb-0"
        />
        <div className="flex items-center justify-end gap-2">
          <OverviewRange />
          <OverviewInterval />
          <LinkButton
            from={Route.fullPath}
            to={'/$organizationId/$projectId/reports'}
            icon={PlusIcon}
          >
            <span className="max-sm:hidden">Create report</span>
            <span className="sm:hidden">Report</span>
          </LinkButton>
        </div>
      </div>

      <div className="flex max-w-6xl flex-col gap-8">
        {reports.map((report) => {
          const chartRange = report.range;
          return (
            <div className="card" key={report.id}>
              <div
                className="flex items-center justify-between border-b border-border p-4 leading-none [&_svg]:hover:opacity-100 cursor-pointer hover:bg-muted/50"
                onClick={(event) => {
                  if (event.metaKey) {
                    window.open(
                      `/${organizationId}/${projectId}/reports/${report.id}`,
                      '_blank',
                    );
                    return;
                  }
                  router.navigate({
                    from: Route.fullPath,
                    to: '/$organizationId/$projectId/reports/$reportId',
                    params: {
                      reportId: report.id,
                    },
                  });
                }}
                // For accessibility
                onKeyUp={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    router.navigate({
                      from: Route.fullPath,
                      to: '/$organizationId/$projectId/reports/$reportId',
                      params: {
                        reportId: report.id,
                      },
                    });
                  }
                }}
                role="button"
                tabIndex={0}
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
                        {
                          timeWindows[chartRange as keyof typeof timeWindows]
                            ?.label
                        }
                      </span>
                      {startDate && endDate ? (
                        <span>Custom dates</span>
                      ) : (
                        range !== null &&
                        chartRange !== range && (
                          <span>
                            {
                              timeWindows[range as keyof typeof timeWindows]
                                ?.label
                            }
                          </span>
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
              </div>
              <div
                className={cn('p-4', report.chartType === 'metric' && 'p-0')}
              >
                <ReportChart
                  report={
                    {
                      ...report,
                      range: range ?? report.range,
                      startDate: startDate ?? null,
                      endDate: endDate ?? null,
                      interval: interval ?? report.interval,
                    } as any
                  }
                />
              </div>
            </div>
          );
        })}
        {reports.length === 0 && (
          <FullPageEmptyState title="No reports" icon={LayoutPanelTopIcon}>
            <p>You can visualize your data with a report</p>
            <LinkButton
              from={Route.fullPath}
              to={'/$organizationId/$projectId/reports'}
              className="mt-14"
              icon={PlusIcon}
            >
              Create report
            </LinkButton>
          </FullPageEmptyState>
        )}
      </div>
    </PageContainer>
  );
}
