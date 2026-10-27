import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, notFound, useSearch } from '@tanstack/react-router';
import { LayoutPanelTopIcon, UnlinkIcon } from 'lucide-react';
import { useMemo } from 'react';
import { z } from 'zod';
import { ShareEnterPassword } from '@/components/auth/share-enter-password';
import { DashboardGrid, useDashboardLayout } from '@/components/dashboard-grid';
import { EmptyState } from '@/components/empty-state';
import { ReadOnlyFilterPills } from '@/components/filters/TableFilterPills';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { LoginNavbar } from '@/components/login-navbar';
import { OverviewInterval } from '@/components/overview/overview-interval';
import { OverviewRange } from '@/components/overview/overview-range';
import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import {
  ReportItemReadOnly,
  ReportItemSkeleton,
} from '@/components/report/report-item';
import { useTRPC } from '@/integrations/trpc/react';

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
      })
    );

    return { share };
  },
  head: ({ loaderData }) => {
    const share = loaderData?.share;

    if (!share) {
      return {
        meta: [
          {
            title: 'Share not found - OpenPanel.dev',
          },
        ],
      };
    }

    // A locked share deliberately carries no dashboard, so title it by owner.
    if (share.requiresPassword) {
      return {
        meta: [
          {
            title: `${share.organization?.name} - OpenPanel.dev`,
          },
        ],
      };
    }

    return {
      meta: [
        {
          title: `${share.dashboard?.name} - ${share.organization?.name} - OpenPanel.dev`,
        },
      ],
    };
  },
  pendingComponent: FullPageLoadingState,
  errorComponent: () => (
    <EmptyState
      description="This link doesn't point to a shared dashboard anymore. Ask whoever sent it for a new one."
      icon={UnlinkIcon}
      title="Share not found"
      variant="page"
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
    })
  );

  // Not fetched while locked: the server answers FORBIDDEN until the password
  // cookie is set, and there is nothing to render before then anyway.
  const reportsQuery = useQuery({
    ...trpc.share.dashboardReports.queryOptions({
      shareId,
    }),
    enabled: !shareQuery.data?.requiresPassword,
  });

  const share = shareQuery.data;
  const reports = useMemo(() => reportsQuery.data ?? [], [reportsQuery.data]);
  const [layout] = useDashboardLayout(reports);

  if (!share) {
    throw notFound();
  }

  // The server refuses non-public shares outright and withholds the dashboard
  // until the password cookie is present, so this only picks the UI.
  if (share.requiresPassword) {
    return <ShareEnterPassword shareId={share.id} shareType="dashboard" />;
  }

  const isHeaderVisible =
    header !== '0' && header !== 0 && header !== 'false' && header !== false;

  return (
    <div>
      {isHeaderVisible && (
        <div className="mx-auto max-w-7xl">
          <LoginNavbar className="relative p-4" />
        </div>
      )}
      <div className="sticky-header [animation-range:50px_100px]!">
        <div className="col mx-auto max-w-7xl gap-2 p-4">
          <div className="row justify-between">
            <div className="flex gap-2">
              <OverviewRange />
              <OverviewInterval />
            </div>
          </div>
          <ReadOnlyFilterPills filters={share.dashboard.filters} />
        </div>
      </div>
      <div className="mx-auto max-w-7xl p-4">
        {reportsQuery.isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ReportItemSkeleton />
            <ReportItemSkeleton />
            <ReportItemSkeleton />
            <ReportItemSkeleton />
            <ReportItemSkeleton />
            <ReportItemSkeleton />
          </div>
        ) : reports.length === 0 ? (
          <EmptyState
            description="Reports added to this dashboard will show up here."
            icon={LayoutPanelTopIcon}
            title="This dashboard is empty"
          />
        ) : (
          <DashboardGrid layout={layout}>
            {reports.map((report) => (
              <div key={report.id}>
                <ReportItemReadOnly
                  endDate={endDate}
                  interval={interval}
                  range={range}
                  report={report}
                  shareId={shareId}
                  startDate={startDate}
                />
              </div>
            ))}
          </DashboardGrid>
        )}
      </div>
    </div>
  );
}
