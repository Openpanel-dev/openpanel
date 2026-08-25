import { ShareEnterPassword } from '@/components/auth/share-enter-password';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { LoginNavbar } from '@/components/login-navbar';
import { OverviewInterval } from '@/components/overview/overview-interval';
import { OverviewRange } from '@/components/overview/overview-range';
import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { ReportChart } from '@/components/report-chart';
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

    // A locked share deliberately carries no report, so title it by owner only.
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
          title: `${share.report.name || 'Report'} - ${share.organization?.name} - OpenPanel.dev`,
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
  const { range, startDate, endDate, interval } = useOverviewOptions();
  const shareQuery = useSuspenseQuery(
    trpc.share.report.queryOptions({
      shareId,
    }),
  );

  const share = shareQuery.data;

  if (!share) {
    throw notFound();
  }

  // The server refuses non-public shares outright and withholds the report
  // until the password cookie is present, so this only picks the UI.
  if (share.requiresPassword) {
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
        <div className="card">
          <div className="p-4 border-b">
            <div className="font-medium text-xl">{share.report.name}</div>
          </div>
          <div className="p-4">
            <ReportChart
              report={{
                ...share.report,
                range: range ?? share.report.range,
                startDate: startDate ?? share.report.startDate,
                endDate: endDate ?? share.report.endDate,
                interval: interval ?? share.report.interval,
              }}
              shareId={shareId}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
