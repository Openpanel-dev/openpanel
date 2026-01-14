import { ShareEnterPassword } from '@/components/auth/share-enter-password';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { GrafanaGrid, useReportLayouts } from '@/components/grafana-grid';
import { LoginNavbar } from '@/components/login-navbar';
import { OverviewInterval } from '@/components/overview/overview-interval';
import { OverviewRange } from '@/components/overview/overview-range';
import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { ReportChart } from '@/components/report-chart';
import {
  ReportItem,
  ReportItemReadOnly,
  ReportItemSkeleton,
} from '@/components/report/report-item';
import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';
import { timeWindows } from '@openpanel/constants';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, notFound, useSearch } from '@tanstack/react-router';
import { z } from 'zod';

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
    return <ShareEnterPassword shareId={share.id} shareType="dashboard" />;
  }

  const isHeaderVisible =
    header !== '0' && header !== 0 && header !== 'false' && header !== false;

  const reports = reportsQuery.data ?? [];

  // Convert reports to grid layout format for all breakpoints
  const layouts = useReportLayouts(reports);

  return (
    <div>
      {isHeaderVisible && (
        <div className="mx-auto max-w-7xl">
          <LoginNavbar className="relative p-4" />
        </div>
      )}
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
      <div className="mx-auto max-w-7xl p-4">
        {reportsQuery.isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ReportItemSkeleton />
            <ReportItemSkeleton />
            <ReportItemSkeleton />
            <ReportItemSkeleton />
            <ReportItemSkeleton />
            <ReportItemSkeleton />
          </div>
        ) : reports.length === 0 ? (
          <FullPageEmptyState title="No reports" />
        ) : (
          <GrafanaGrid layouts={layouts}>
            {reports.map((report) => (
              <div key={report.id}>
                <ReportItemReadOnly
                  report={report}
                  shareId={shareId}
                  range={range}
                  startDate={startDate}
                  endDate={endDate}
                  interval={interval}
                />
              </div>
            ))}
          </GrafanaGrid>
        )}
      </div>
    </div>
  );
}
