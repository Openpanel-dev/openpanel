import { ShareEnterPassword } from '@/components/auth/share-enter-password';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { LoginNavbar } from '@/components/login-navbar';
import { ReportChart } from '@/components/report-chart';
import { OverviewRange } from '@/components/overview/overview-range';
import { OverviewInterval } from '@/components/overview/overview-interval';
import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { PageContainer } from '@/components/page-container';
import { useTRPC } from '@/integrations/trpc/react';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, notFound, useSearch } from '@tanstack/react-router';
import { z } from 'zod';
import { useMemo } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { cn } from '@/utils/cn';
import { timeWindows } from '@openpanel/constants';

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

const shareSearchSchema = z.object({
  header: z.optional(z.number().or(z.string().or(z.boolean()))),
});

export const Route = createFileRoute('/share/dashboard/$shareId')({
  component: RouteComponent,
  validateSearch: shareSearchSchema,
  loader: async ({ context, params }) => {
    const share = await context.queryClient.ensureQueryData(
      context.trpc.share.dashboard.queryOptions({
        shareId: params.shareId,
      }),
    );

    return { share };
  },
  head: ({ loaderData }) => {
    if (!loaderData || !loaderData.share) {
      return {
        meta: [
          {
            title: 'Share not found - OpenPanel.dev',
          },
        ],
      };
    }

    return {
      meta: [
        {
          title: `${loaderData.share.dashboard?.name} - ${loaderData.share.organization?.name} - OpenPanel.dev`,
        },
      ],
    };
  },
  pendingComponent: FullPageLoadingState,
  errorComponent: () => (
    <FullPageEmptyState
      title="Share not found"
      description="The dashboard you are looking for does not exist."
      className="min-h-[calc(100vh-theme(spacing.16))]"
    />
  ),
});

// Report Item Component for shared view
function ReportItem({
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
          report={
            {
              ...report,
              range: range ?? report.range,
              startDate: startDate ?? null,
              endDate: endDate ?? null,
              interval: interval ?? report.interval,
            } as any
          }
          shareId={shareId}
          shareType="dashboard"
        />
      </div>
    </div>
  );
}

function RouteComponent() {
  const { shareId } = Route.useParams();
  const { header } = useSearch({ from: '/share/dashboard/$shareId' });
  const trpc = useTRPC();
  const { range, startDate, endDate, interval } = useOverviewOptions();
  
  const shareQuery = useSuspenseQuery(
    trpc.share.dashboard.queryOptions({
      shareId,
    }),
  );

  const reportsQuery = useQuery(
    trpc.share.dashboardReports.queryOptions({
      shareId,
    }),
  );

  const hasAccess = shareQuery.data?.hasAccess;

  if (!shareQuery.data) {
    throw notFound();
  }

  if (!shareQuery.data.public) {
    throw notFound();
  }

  const share = shareQuery.data;

  // Handle password protection
  if (share.password && !hasAccess) {
    return (
      <ShareEnterPassword shareId={share.id} shareType="dashboard" />
    );
  }

  const isHeaderVisible =
    header !== '0' && header !== 0 && header !== 'false' && header !== false;

  const reports = reportsQuery.data ?? [];

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

  return (
    <div>
      {isHeaderVisible && (
        <div className="mx-auto max-w-7xl">
          <LoginNavbar className="relative p-4" />
        </div>
      )}
      <PageContainer>
        <div className="sticky-header [animation-range:50px_100px]!">
          <div className="p-4 col gap-2 mx-auto max-w-7xl">
            <div className="row justify-between">
              <div className="flex gap-2">
                <OverviewRange />
                <OverviewInterval />
              </div>
            </div>
          </div>
        </div>
        {reports.length === 0 ? (
          <FullPageEmptyState title="No reports" />
        ) : (
          <div className="w-full overflow-hidden -mx-4">
            <style>{`
              .react-grid-item {
                transition: none !important;
              }
              .react-grid-item.react-grid-placeholder {
                display: none !important;
              }
            `}</style>
            <ResponsiveGridLayout
              className="layout"
              layouts={layouts}
              breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
              cols={{ lg: 12, md: 12, sm: 6, xs: 4, xxs: 2 }}
              rowHeight={100}
              draggableHandle=".drag-handle"
              compactType="vertical"
              preventCollision={false}
              isDraggable={false}
              isResizable={false}
              margin={[16, 16]}
              transformScale={1}
              useCSSTransforms={true}
            >
              {reports.map((report) => (
                <div key={report.id}>
                  <ReportItem
                    report={report}
                    shareId={shareId}
                    range={range}
                    startDate={startDate}
                    endDate={endDate}
                    interval={interval}
                  />
                </div>
              ))}
            </ResponsiveGridLayout>
          </div>
        )}
      </PageContainer>
    </div>
  );
}

