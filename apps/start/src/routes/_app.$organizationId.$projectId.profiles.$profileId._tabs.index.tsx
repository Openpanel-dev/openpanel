import FullPageLoadingState from '@/components/full-page-loading-state';
import { LatestEvents } from '@/components/profiles/latest-events';
import { MostEvents } from '@/components/profiles/most-events';
import { PopularRoutes } from '@/components/profiles/popular-routes';
import { ProfileActivity } from '@/components/profiles/profile-activity';
import { ProfileCharts } from '@/components/profiles/profile-charts';
import { ProfileMetrics } from '@/components/profiles/profile-metrics';
import { ProfileProperties } from '@/components/profiles/profile-properties';
import { useTRPC } from '@/integrations/trpc/react';
import { PAGE_TITLES, createProjectTitle } from '@/utils/title';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/profiles/$profileId/_tabs/',
)({
  component: Component,
  loader: async ({ context, params }) => {
    // Prefetch all profile data
    await Promise.all([
      context.queryClient.prefetchQuery(
        context.trpc.profile.metrics.queryOptions({
          profileId: params.profileId,
          projectId: params.projectId,
        }),
      ),
      context.queryClient.prefetchQuery(
        context.trpc.profile.activity.queryOptions({
          profileId: params.profileId,
          projectId: params.projectId,
        }),
      ),
      context.queryClient.prefetchQuery(
        context.trpc.profile.mostEvents.queryOptions({
          profileId: params.profileId,
          projectId: params.projectId,
        }),
      ),
      context.queryClient.prefetchQuery(
        context.trpc.profile.popularRoutes.queryOptions({
          profileId: params.profileId,
          projectId: params.projectId,
        }),
      ),
    ]);
  },
  pendingComponent: FullPageLoadingState,
  head: () => {
    return {
      meta: [
        {
          title: createProjectTitle(PAGE_TITLES.PROFILE_DETAILS),
        },
      ],
    };
  },
});

function Component() {
  const { profileId, projectId, organizationId } = Route.useParams();
  const trpc = useTRPC();

  const profile = useSuspenseQuery(
    trpc.profile.byId.queryOptions({
      profileId,
      projectId,
    }),
  );

  const metrics = useSuspenseQuery(
    trpc.profile.metrics.queryOptions({
      profileId,
      projectId,
    }),
  );

  const activity = useSuspenseQuery(
    trpc.profile.activity.queryOptions({
      profileId,
      projectId,
    }),
  );

  const mostEvents = useSuspenseQuery(
    trpc.profile.mostEvents.queryOptions({
      profileId,
      projectId,
    }),
  );

  const popularRoutes = useSuspenseQuery(
    trpc.profile.popularRoutes.queryOptions({
      profileId,
      projectId,
    }),
  );

  return (
    <>
      {/* Main content grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="col-span-1 md:col-span-2">
          <ProfileMetrics data={metrics.data} />
        </div>
        {/* Profile properties - full width */}
        <div className="col-span-1 md:col-span-2">
          <ProfileProperties profile={profile.data!} />
        </div>

        {/* Heatmap / Activity */}
        <div className="col-span-1">
          <ProfileActivity data={activity.data} />
        </div>

        {/* Latest events */}
        <div className="col-span-1">
          <LatestEvents
            profileId={profileId}
            projectId={projectId}
            organizationId={organizationId}
          />
        </div>

        {/* Most events */}
        <div className="col-span-1">
          <MostEvents data={mostEvents.data} />
        </div>

        {/* Popular routes */}
        <div className="col-span-1">
          <PopularRoutes data={popularRoutes.data} />
        </div>

        {/* Charts - spans both columns */}
        <div className="col-span-1 md:col-span-2">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <ProfileCharts profileId={profileId} projectId={projectId} />
          </div>
        </div>
      </div>
    </>
  );
}
