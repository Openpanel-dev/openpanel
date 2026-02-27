import { FullPageEmptyState } from '@/components/full-page-empty-state';
import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { Button, LinkButton } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { createProjectTitle } from '@/utils/title';
import {
  LayoutPanelTopIcon,
  MoreHorizontal,
  PlusIcon,
  RotateCcw,
  ShareIcon,
  TrashIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import FullPageLoadingState from '@/components/full-page-loading-state';
import {
  GrafanaGrid,
  type Layout,
  useReportLayouts,
} from '@/components/grafana-grid';
import { OverviewInterval } from '@/components/overview/overview-interval';
import { OverviewRange } from '@/components/overview/overview-range';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import {
  ReportItem,
  ReportItemSkeleton,
} from '@/components/report/report-item';
import { handleErrorToastOptions, useTRPC } from '@/integrations/trpc/react';
import { pushModal, showConfirm } from '@/modals';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/dashboards_/$dashboardId',
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
  const queryClient = useQueryClient();
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

  const dashboardDeletion = useMutation(
    trpc.dashboard.delete.mutationOptions({
      onError: handleErrorToastOptions({}),
      onSuccess() {
        queryClient.invalidateQueries(trpc.dashboard.list.pathFilter());
        toast('Dashboard deleted');
        router.navigate({
          to: '/$organizationId/$projectId/dashboards',
          params: {
            organizationId,
            projectId,
          },
        });
      },
    }),
  );

  const reports = reportsQuery.data ?? [];
  const dashboard = dashboardQuery.data;
  const [isGridReady, setIsGridReady] = useState(false);
  const [enableTransitions, setEnableTransitions] = useState(false);

  // Wait for initial render to ensure grid has proper dimensions
  useEffect(() => {
    if (reports.length > 0 && !isGridReady) {
      // Small delay to ensure container has rendered with proper width
      const timer = setTimeout(() => {
        setIsGridReady(true);
        // Enable transitions after initial render
        setTimeout(() => setEnableTransitions(true), 100);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [reports.length, isGridReady]);

  const reportDeletion = useMutation(
    trpc.report.delete.mutationOptions({
      onError: handleErrorToastOptions({}),
      onSuccess() {
        queryClient.invalidateQueries(trpc.dashboard.list.pathFilter());
        reportsQuery.refetch();
        toast('Report deleted');
      },
    }),
  );

  const reportDuplicate = useMutation(
    trpc.report.duplicate.mutationOptions({
      onError: handleErrorToastOptions({}),
      onSuccess() {
        queryClient.invalidateQueries(trpc.dashboard.list.pathFilter());
        reportsQuery.refetch();
        toast('Report duplicated');
      },
    }),
  );

  const updateLayout = useMutation(
    trpc.report.updateLayout.mutationOptions({
      onError: handleErrorToastOptions({}),
      onSuccess() {
        // Silently refetch reports (which includes layouts)
        reportsQuery.refetch();
      },
    }),
  );

  const resetLayout = useMutation(
    trpc.report.resetLayout.mutationOptions({
      onError: handleErrorToastOptions({}),
      onSuccess() {
        toast('Layout reset to default');
        reportsQuery.refetch();
      },
    }),
  );

  // Convert reports to grid layout format for all breakpoints
  const layouts = useReportLayouts(reports);

  const handleLayoutChange = useCallback((newLayout: Layout[]) => {
    // This is called during dragging/resizing, we'll save on drag/resize stop
  }, []);

  const handleDragStop = useCallback(
    (newLayout: Layout[]) => {
      // Save each changed layout after drag stops
      newLayout.forEach((item) => {
        const report = reports.find((r) => r.id === item.i);
        if (report) {
          const oldLayout = report.layout;
          // Only update if layout actually changed
          if (
            !oldLayout ||
            oldLayout.x !== item.x ||
            oldLayout.y !== item.y ||
            oldLayout.w !== item.w ||
            oldLayout.h !== item.h
          ) {
            updateLayout.mutate({
              reportId: item.i,
              layout: {
                x: item.x,
                y: item.y,
                w: item.w,
                h: item.h,
                minW: item.minW ?? 3,
                minH: item.minH ?? 3,
              },
            });
          }
        }
      });
    },
    [reports, updateLayout],
  );

  const handleResizeStop = useCallback(
    (newLayout: Layout[]) => {
      // Save each changed layout after resize stops
      newLayout.forEach((item) => {
        const report = reports.find((r) => r.id === item.i);
        if (report) {
          const oldLayout = report.layout;
          // Only update if layout actually changed
          if (
            !oldLayout ||
            oldLayout.x !== item.x ||
            oldLayout.y !== item.y ||
            oldLayout.w !== item.w ||
            oldLayout.h !== item.h
          ) {
            updateLayout.mutate({
              reportId: item.i,
              layout: {
                x: item.x,
                y: item.y,
                w: item.w,
                h: item.h,
                minW: item.minW ?? 3,
                minH: item.minH ?? 3,
              },
            });
          }
        }
      });
    },
    [reports, updateLayout],
  );

  if (!dashboard) {
    return null; // Loading handled by suspense
  }

  return (
    <PageContainer>
      <PageHeader
        title={dashboard.name}
        description="View and manage your reports"
        className="mb-4"
        actions={
          <>
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[200px]">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={() =>
                      pushModal('ShareDashboardModal', { dashboardId })
                    }
                  >
                    <ShareIcon className="mr-2 size-4" />
                    Share dashboard
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      showConfirm({
                        title: 'Reset layout',
                        text: 'Are you sure you want to reset the layout to default? This will clear all custom positioning and sizing.',
                        onConfirm: () =>
                          resetLayout.mutate({ dashboardId, projectId }),
                      })
                    }
                  >
                    <RotateCcw className="mr-2 size-4" />
                    Reset layout
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() =>
                      showConfirm({
                        title: 'Delete dashboard',
                        text: 'Are you sure you want to delete this dashboard? All your reports will be deleted!',
                        onConfirm: () =>
                          dashboardDeletion.mutate({ id: dashboardId }),
                      })
                    }
                  >
                    <TrashIcon className="mr-2 size-4" />
                    Delete dashboard
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {reports.length === 0 ? (
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
      ) : !isGridReady || reportsQuery.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ReportItemSkeleton />
          <ReportItemSkeleton />
          <ReportItemSkeleton />
          <ReportItemSkeleton />
          <ReportItemSkeleton />
          <ReportItemSkeleton />
        </div>
      ) : (
        <GrafanaGrid
          transitions={enableTransitions}
          layouts={layouts}
          onLayoutChange={handleLayoutChange}
          onDragStop={handleDragStop}
          onResizeStop={handleResizeStop}
          isDraggable={true}
          isResizable={true}
        >
          {reports.map((report) => (
            <div key={report.id}>
              <ReportItem
                report={report}
                organizationId={organizationId}
                projectId={projectId}
                range={range}
                startDate={startDate}
                endDate={endDate}
                interval={interval}
                onDelete={(reportId) => {
                  reportDeletion.mutate({ reportId });
                }}
                onDuplicate={(reportId) => {
                  reportDuplicate.mutate({ reportId });
                }}
              />
            </div>
          ))}
        </GrafanaGrid>
      )}
    </PageContainer>
  );
}
