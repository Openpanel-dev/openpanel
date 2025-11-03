import { FullPageEmptyState } from '@/components/full-page-empty-state';
import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { ReportChart } from '@/components/report-chart';
import { Button, LinkButton } from '@/components/ui/button';
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
  CopyIcon,
  LayoutPanelTopIcon,
  MoreHorizontal,
  PlusIcon,
  RotateCcw,
  Trash,
  TrashIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { timeWindows } from '@openpanel/constants';

import FullPageLoadingState from '@/components/full-page-loading-state';
import { OverviewInterval } from '@/components/overview/overview-interval';
import { OverviewRange } from '@/components/overview/overview-range';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { handleErrorToastOptions, useTRPC } from '@/integrations/trpc/react';
import { showConfirm } from '@/modals';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

type Layout = {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
};

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

// Report Skeleton Component
function ReportSkeleton() {
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

// Report Item Component
function ReportItem({
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
              from: Route.fullPath,
              to: '/$organizationId/$projectId/reports/$reportId',
              params: {
                reportId: report.id,
              },
            });
          }}
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
}

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

  const dashboardDeletion = useMutation(
    trpc.dashboard.delete.mutationOptions({
      onError: handleErrorToastOptions({}),
      onSuccess() {
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
        reportsQuery.refetch();
        toast('Report deleted');
      },
    }),
  );

  const reportDuplicate = useMutation(
    trpc.report.duplicate.mutationOptions({
      onError: handleErrorToastOptions({}),
      onSuccess() {
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
  const layouts = useMemo(() => {
    const baseLayout = reports.map((report, index) => ({
      i: report.id,
      x: report.layout?.x ?? (index % 2) * 6,
      y: report.layout?.y ?? Math.floor(index / 2) * 4,
      w: report.layout?.w ?? 6,
      h: report.layout?.h ?? 4,
      minW: 3,
      minH: 3,
    }));

    // Create responsive layouts for different breakpoints
    return {
      lg: baseLayout,
      md: baseLayout,
      sm: baseLayout.map((item) => ({ ...item, w: Math.min(item.w, 6) })),
      xs: baseLayout.map((item) => ({ ...item, w: 4, x: 0 })),
      xxs: baseLayout.map((item) => ({ ...item, w: 2, x: 0 })),
    };
  }, [reports]);

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
        </div>
      </div>

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
          <ReportSkeleton />
          <ReportSkeleton />
          <ReportSkeleton />
          <ReportSkeleton />
          <ReportSkeleton />
          <ReportSkeleton />
        </div>
      ) : (
        <div className="w-full overflow-hidden -mx-4">
          <style>{`
            .react-grid-item {
              transition: ${enableTransitions ? 'transform 200ms ease, width 200ms ease, height 200ms ease' : 'none'} !important;
            }
            .react-grid-item.react-grid-placeholder {
              background: none !important;
              opacity: 0.5;
              transition-duration: 100ms;
              border-radius: 0.5rem;
              border: 1px dashed var(--primary);
            }
            .react-grid-item.resizing {
              transition: none !important;
            }
          `}</style>
          <ResponsiveGridLayout
            className="layout"
            layouts={layouts}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            cols={{ lg: 12, md: 12, sm: 6, xs: 4, xxs: 2 }}
            rowHeight={100}
            onLayoutChange={handleLayoutChange}
            onDragStop={handleDragStop}
            onResizeStop={handleResizeStop}
            draggableHandle=".drag-handle"
            compactType="vertical"
            preventCollision={false}
            isDraggable={true}
            isResizable={true}
            margin={[16, 16]}
            transformScale={1}
            useCSSTransforms={true}
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
          </ResponsiveGridLayout>
        </div>
      )}
    </PageContainer>
  );
}
