import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import {
  ChartLineIcon,
  MoreHorizontal,
  PlusIcon,
  RotateCcw,
  SearchIcon,
  ShareIcon,
  TrashIcon,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  DashboardGrid,
  isSameTilePosition,
  type Layout,
  TILE_MIN_SIZE,
  useDashboardLayout,
} from '@/components/dashboard-grid';
import { EmptyState } from '@/components/empty-state';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { OverviewInterval } from '@/components/overview/overview-interval';
import { OverviewRange } from '@/components/overview/overview-range';
import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import {
  ReportItem,
  ReportItemSkeleton,
} from '@/components/report/report-item';
import { Button, LinkButton } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useDashboardPageContext } from '@/hooks/use-page-context-helpers';
import { useTileViews } from '@/hooks/use-tile-views';
import { handleErrorToastOptions, useTRPC } from '@/integrations/trpc/react';
import { pushModal, showConfirm } from '@/modals';
import { createProjectTitle } from '@/utils/title';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/dashboards_/$dashboardId'
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
        })
      ),
      context.queryClient.prefetchQuery(
        context.trpc.report.list.queryOptions({
          dashboardId: params.dashboardId,
          projectId: params.projectId,
        })
      ),
      context.queryClient.prefetchQuery(
        context.trpc.project.getProjectWithClients.queryOptions({
          projectId: params.projectId,
        })
      ),
      context.queryClient.prefetchQuery(
        context.trpc.organization.get.queryOptions({
          organizationId: params.organizationId,
        })
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
    })
  );

  const reportsQuery = useQuery(
    trpc.report.list.queryOptions({
      dashboardId,
      projectId,
    })
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
    })
  );

  const reports = useMemo(() => reportsQuery.data ?? [], [reportsQuery.data]);
  const dashboard = dashboardQuery.data;
  const [search, setSearch] = useState('');

  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return reports;
    }
    return reports.filter((r) => r.name?.toLowerCase().includes(q));
  }, [reports, search]);

  const reportDeletion = useMutation(
    trpc.report.delete.mutationOptions({
      onError: handleErrorToastOptions({}),
      onSuccess() {
        queryClient.invalidateQueries(trpc.dashboard.list.pathFilter());
        reportsQuery.refetch();
        toast('Report deleted');
      },
    })
  );

  const reportDuplicate = useMutation(
    trpc.report.duplicate.mutationOptions({
      onError: handleErrorToastOptions({}),
      onSuccess() {
        queryClient.invalidateQueries(trpc.dashboard.list.pathFilter());
        reportsQuery.refetch();
        toast('Report duplicated');
      },
    })
  );

  const reportsQueryKey = trpc.report.list.queryKey({ dashboardId, projectId });
  const { mutate: saveLayouts } = useMutation(
    trpc.report.updateLayouts.mutationOptions({
      onSuccess(savedLayouts) {
        queryClient.setQueryData(reportsQueryKey, (current) =>
          current?.map((report) => ({
            ...report,
            layout:
              savedLayouts.find((saved) => saved.reportId === report.id) ??
              report.layout,
          }))
        );
      },
      onError(error) {
        handleErrorToastOptions({})(error);
        // The grid already shows the rejected layout; the saved one is the rollback.
        queryClient.invalidateQueries({ queryKey: reportsQueryKey });
      },
    })
  );

  const { unsavedViews, changeView } = useTileViews({ dashboardId, projectId });
  const resetLayout = useMutation(
    trpc.report.resetLayout.mutationOptions({
      onError: handleErrorToastOptions({}),
      onSuccess() {
        toast('Layout reset to default');
        reportsQuery.refetch();
      },
    })
  );

  const [layout, setLayout] = useDashboardLayout(filteredReports);

  useDashboardPageContext(dashboardId);

  const saveLayout = useCallback(
    (newLayout: Layout) => {
      const items = newLayout
        .filter((item) => {
          const saved = reports.find((report) => report.id === item.i)?.layout;
          return !(saved && isSameTilePosition(item, saved));
        })
        .map((item) => ({
          reportId: item.i,
          layout: {
            x: item.x,
            y: item.y,
            w: item.w,
            h: item.h,
            minW: item.minW ?? TILE_MIN_SIZE.minW,
            minH: item.minH ?? TILE_MIN_SIZE.minH,
          },
        }));
      if (items.length === 0) {
        return;
      }
      saveLayouts({ dashboardId, projectId, items });
    },
    [reports, saveLayouts, dashboardId, projectId]
  );

  // The grid re-renders on every drag frame; tiles that keep their element
  // identity are skipped by the grid's memo, so no chart renders mid-drag.
  const deleteReport = reportDeletion.mutate;
  const duplicateReport = reportDuplicate.mutate;
  const moveReport = useCallback(
    (reportId: string) => pushModal('MoveReport', { reportId, dashboardId }),
    [dashboardId]
  );
  const tiles = useMemo(
    () =>
      filteredReports.map((report) => {
        const unsavedView = unsavedViews[report.id];
        return (
          <div key={report.id}>
            <ReportItem
              endDate={endDate}
              interval={interval}
              onDelete={(reportId) => deleteReport({ reportId })}
              onDuplicate={(reportId) => duplicateReport({ reportId })}
              onMove={moveReport}
              onViewChange={changeView}
              organizationId={organizationId}
              projectId={projectId}
              range={range}
              report={
                unsavedView
                  ? { ...report, display: { view: unsavedView } }
                  : report
              }
              startDate={startDate}
            />
          </div>
        );
      }),
    [
      filteredReports,
      unsavedViews,
      endDate,
      interval,
      range,
      startDate,
      organizationId,
      projectId,
      deleteReport,
      duplicateReport,
      moveReport,
      changeView,
    ]
  );

  if (!dashboard) {
    return null; // Loading handled by suspense
  }

  return (
    <PageContainer>
      <PageHeader
        actions={
          <>
            {reports.length > 0 && (
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="w-[180px] pl-8 sm:w-[220px]"
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search reports..."
                  type="search"
                  value={search}
                />
              </div>
            )}
            <OverviewRange />
            <OverviewInterval />
            <LinkButton
              from={Route.fullPath}
              icon={PlusIcon}
              search={{ dashboardId }}
              to={'/$organizationId/$projectId/reports'}
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
                    onClick={() =>
                      showConfirm({
                        title: 'Delete dashboard',
                        text: 'Are you sure you want to delete this dashboard? All your reports will be deleted!',
                        onConfirm: () =>
                          dashboardDeletion.mutate({ id: dashboardId }),
                      })
                    }
                    variant="destructive"
                  >
                    <TrashIcon className="mr-2 size-4" />
                    Delete dashboard
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
        className="mb-4"
        description="View and manage your reports"
        title={dashboard.name}
      />

      {reports.length === 0 ? (
        <EmptyState
          description="Reports you save to this dashboard show up here as tiles you can move and resize."
          icon={ChartLineIcon}
          title="No reports on this dashboard yet"
        >
          <LinkButton
            from={Route.fullPath}
            icon={PlusIcon}
            search={{ dashboardId }}
            to={'/$organizationId/$projectId/reports'}
          >
            Create report
          </LinkButton>
        </EmptyState>
      ) : reportsQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ReportItemSkeleton />
          <ReportItemSkeleton />
          <ReportItemSkeleton />
          <ReportItemSkeleton />
          <ReportItemSkeleton />
          <ReportItemSkeleton />
        </div>
      ) : filteredReports.length === 0 ? (
        <EmptyState
          description={`Nothing on this dashboard matches “${search}”.`}
          icon={SearchIcon}
          title="No matching reports"
        >
          <Button onClick={() => setSearch('')} variant="outline">
            Clear search
          </Button>
        </EmptyState>
      ) : (
        <DashboardGrid
          isEditable={!search}
          layout={layout}
          onDragStop={saveLayout}
          onLayoutChange={setLayout}
          onResizeStop={saveLayout}
        >
          {tiles}
        </DashboardGrid>
      )}
    </PageContainer>
  );
}
