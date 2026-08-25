import { ShareEnterPassword } from '@/components/auth/share-enter-password';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { LazyComponent } from '@/components/lazy-component';
import { LoginNavbar } from '@/components/login-navbar';
import { OverviewFiltersButtons } from '@/components/overview/filters/overview-filters-buttons';
import { LiveCounter } from '@/components/overview/live-counter';
import OverviewMetrics from '@/components/overview/overview-metrics';
import { OverviewRange } from '@/components/overview/overview-range';
import OverviewTopDevices from '@/components/overview/overview-top-devices';
import OverviewTopEvents from '@/components/overview/overview-top-events';
import OverviewTopGeo from '@/components/overview/overview-top-geo';
import OverviewTopPages from '@/components/overview/overview-top-pages';
import OverviewTopSources from '@/components/overview/overview-top-sources';
import OverviewUserJourney from '@/components/overview/overview-user-journey';
import OverviewWeeklyTrends from '@/components/overview/overview-weekly-trends';
import { useTRPC } from '@/integrations/trpc/react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, notFound, useSearch } from '@tanstack/react-router';
import { z } from 'zod';

const shareSearchSchema = z.object({
  header: z.optional(z.number().or(z.string().or(z.boolean()))),
});

export const Route = createFileRoute('/share/overview/$shareId')({
  component: RouteComponent,
  validateSearch: shareSearchSchema,
  loader: async ({ context, params }) => {
    const share = await context.queryClient.ensureQueryData(
      context.trpc.share.overview.queryOptions({
        shareId: params.shareId,
      }),
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

    return {
      meta: [
        {
          title: `${share.project?.name} - ${share.organization?.name} - OpenPanel.dev`,
        },
      ],
    };
  },
  pendingComponent: FullPageLoadingState,
  errorComponent: () => (
    <FullPageEmptyState
      title="Share not found"
      description="The overview you are looking for does not exist."
      className="min-h-[calc(100vh-theme(spacing.16))]"
    />
  ),
});

function RouteComponent() {
  const { shareId } = Route.useParams();
  const { header } = useSearch({ from: '/share/overview/$shareId' });
  const trpc = useTRPC();
  const shareQuery = useSuspenseQuery(
    trpc.share.overview.queryOptions({
      shareId,
    }),
  );

  if (shareQuery.isLoading) {
    return <div>Loading...</div>;
  }

  const share = shareQuery.data;

  if (!share) {
    throw notFound();
  }

  // The server refuses non-public shares outright and withholds projectId
  // until the password cookie is present, so this only picks the UI.
  if (share.requiresPassword) {
    return <ShareEnterPassword shareId={share.id} />;
  }

  const projectId = share.projectId;

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
            </div>
            <div className="flex gap-2">
              <LiveCounter projectId={projectId} shareId={shareId} />
            </div>
          </div>
          <OverviewFiltersButtons />
        </div>
      </div>
      <div className="mx-auto grid max-w-7xl grid-cols-6 gap-4 p-4">
        <OverviewMetrics projectId={projectId} shareId={shareId} />
        <OverviewTopSources projectId={projectId} shareId={shareId} />
        <OverviewTopPages projectId={projectId} shareId={shareId} />
        <OverviewTopDevices projectId={projectId} shareId={shareId} />
        <OverviewTopEvents projectId={projectId} shareId={shareId} />
        <OverviewTopGeo projectId={projectId} shareId={shareId} />
        <LazyComponent className="col-span-6">
          <OverviewWeeklyTrends projectId={projectId} shareId={shareId} />
        </LazyComponent>
        <LazyComponent className="col-span-6">
          <OverviewUserJourney projectId={projectId} shareId={shareId} />
        </LazyComponent>
      </div>
    </div>
  );
}
