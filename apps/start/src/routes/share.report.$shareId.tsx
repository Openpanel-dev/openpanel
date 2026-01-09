import { ShareEnterPassword } from '@/components/auth/share-enter-password';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { LoginNavbar } from '@/components/login-navbar';
import { ReportChart } from '@/components/report-chart';
import { OverviewRange } from '@/components/overview/overview-range';
import { OverviewInterval } from '@/components/overview/overview-interval';
import { PageContainer } from '@/components/page-container';
import { useTRPC } from '@/integrations/trpc/react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, notFound, useSearch } from '@tanstack/react-router';
import { z } from 'zod';

const shareSearchSchema = z.object({
  header: z.optional(z.number().or(z.string().or(z.boolean()))),
});

export const Route = createFileRoute('/share/report/$shareId')({
  component: RouteComponent,
  validateSearch: shareSearchSchema,
  loader: async ({ context, params }) => {
    const share = await context.queryClient.ensureQueryData(
      context.trpc.share.report.queryOptions({
        shareId: params.shareId,
      }),
    );

    if (!share) {
      return { share: null };
    }

    const report = await context.queryClient.ensureQueryData(
      context.trpc.report.get.queryOptions({
        reportId: share.reportId,
      }),
    );

    return { share, report };
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
          title: `${loaderData.report?.name || 'Report'} - ${loaderData.share.organization?.name} - OpenPanel.dev`,
        },
      ],
    };
  },
  pendingComponent: FullPageLoadingState,
  errorComponent: () => (
    <FullPageEmptyState
      title="Share not found"
      description="The report you are looking for does not exist."
      className="min-h-[calc(100vh-theme(spacing.16))]"
    />
  ),
});

function RouteComponent() {
  const { shareId } = Route.useParams();
  const { header } = useSearch({ from: '/share/report/$shareId' });
  const trpc = useTRPC();
  const shareQuery = useSuspenseQuery(
    trpc.share.report.queryOptions({
      shareId,
    }),
  );

  const reportQuery = useSuspenseQuery(
    trpc.report.get.queryOptions({
      reportId: shareQuery.data!.reportId,
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
  const report = reportQuery.data;

  // Handle password protection
  if (share.password && !hasAccess) {
    return <ShareEnterPassword shareId={share.id} shareType="report" />;
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
        <div className="p-4">
          <div className="card">
            <div className="p-4 border-b">
              <div className="font-medium text-xl">{report.name}</div>
            </div>
            <div className="p-4">
              <ReportChart
                report={report}
                shareId={shareId}
                shareType="report"
              />
            </div>
          </div>
        </div>
      </PageContainer>
    </div>
  );
}

