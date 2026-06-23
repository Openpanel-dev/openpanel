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
  SearchIcon,
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
import { Input } from '@/components/ui/input';
import { useDashboardPageContext } from '@/hooks/use-page-context-helpers';
import i18n from '@/i18n';
import { handleErrorToastOptions, useTRPC } from '@/integrations/trpc/react';
import { pushModal, showConfirm } from '@/modals';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/dashboards_/$dashboardId',
)({
  component: Component,
  head: () => {
    return {
      meta: [
        {
          title: createProjectTitle(i18n.t('dashboards.dashboard')),
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
  const { t } = useTranslation();
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
        toast(t('dashboards.delete_success'));
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
  const [search, setSearch] = useState('');

  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return reports;
    return reports.filter((r) => r.name?.toLowerCase().includes(q));
  }, [reports, search]);

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
        toast(t('dashboards.report_delete_success'));
      },
    }),
  );

  const reportDuplicate = useMutation(
    trpc.report.duplicate.mutationOptions({
      onError: handleErrorToastOptions({}),
      onSuccess() {
        queryClient.invalidateQueries(trpc.dashboard.list.pathFilter());
        reportsQuery.refetch();
        toast(t('dashboards.report_duplicate_success'));
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
        toast(t('dashboards.layout_reset_success'));
        reportsQuery.refetch();
      },
    }),
  );

  // Convert reports to grid layout format for all breakpoints
  const layouts = useReportLayouts(filteredReports);

  const dashboardPrimer = useMemo(
    () => ({
      name: dashboard?.name,
      reportCount: reports.length,
      reports: reports.map((r) => ({
        id: r.id,
        name: r.name,
        chartType: r.chartType,
      })),
    }),
    [dashboard?.name, reports],
  );

  useDashboardPageContext(dashboardId, dashboardPrimer);

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
        description={t('dashboards.detail_description')}
        className="mb-4"
        actions={
          <>
            {reports.length > 0 && (
              <div className="relative">
                <SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  type="search"
                  placeholder={t('dashboards.search_reports_placeholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 w-[180px] sm:w-[220px]"
                />
              </div>
            )}
            <OverviewRange />
            <OverviewInterval />
            <LinkButton
              from={Route.fullPath}
              to={'/$organizationId/$projectId/reports'}
              icon={PlusIcon}
            >
              <span className="max-sm:hidden">{t('dashboards.create_report')}</span>
              <span className="sm:hidden">{t('dashboards.report')}</span>
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
                    {t('dashboards.share_dashboard')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      showConfirm({
                        title: t('dashboards.reset_layout'),
                        text: t('dashboards.reset_layout_confirm'),
                        onConfirm: () =>
                          resetLayout.mutate({ dashboardId, projectId }),
                      })
                    }
                  >
                    <RotateCcw className="mr-2 size-4" />
                    {t('dashboards.reset_layout')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() =>
                      showConfirm({
                        title: t('dashboards.delete_dashboard'),
                        text: t('dashboards.delete_dashboard_confirm'),
                        onConfirm: () =>
                          dashboardDeletion.mutate({ id: dashboardId }),
                      })
                    }
                  >
                    <TrashIcon className="mr-2 size-4" />
                    {t('dashboards.delete_dashboard')}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {reports.length === 0 ? (
        <FullPageEmptyState title={t('dashboards.no_reports_title')} icon={LayoutPanelTopIcon}>
          <p>{t('dashboards.no_reports_description')}</p>
          <LinkButton
            from={Route.fullPath}
            to={'/$organizationId/$projectId/reports'}
            className="mt-14"
            icon={PlusIcon}
          >
            {t('dashboards.create_report')}
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
      ) : filteredReports.length === 0 ? (
        <FullPageEmptyState title={t('dashboards.no_matching_reports_title')} icon={SearchIcon}>
          <p>{t('dashboards.no_matching_reports_description', { search })}</p>
        </FullPageEmptyState>
      ) : (
        <GrafanaGrid
          transitions={enableTransitions}
          layouts={layouts}
          onLayoutChange={handleLayoutChange}
          onDragStop={handleDragStop}
          onResizeStop={handleResizeStop}
          isDraggable={!search}
          isResizable={!search}
        >
          {filteredReports.map((report) => (
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
