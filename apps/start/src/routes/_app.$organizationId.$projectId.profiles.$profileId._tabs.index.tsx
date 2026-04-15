import FullPageLoadingState from '@/components/full-page-loading-state';
import { LatestEvents } from '@/components/profiles/latest-events';
import { MostEvents } from '@/components/profiles/most-events';
import { PopularRoutes } from '@/components/profiles/popular-routes';
import { ProfileActivity } from '@/components/profiles/profile-activity';
import { ProfileCharts } from '@/components/profiles/profile-charts';
import { ProfileGroups } from '@/components/profiles/profile-groups';
import { ProfileMetrics } from '@/components/profiles/profile-metrics';
import { ProfileProperties } from '@/components/profiles/profile-properties';
import { ProfileSource } from '@/components/profiles/profile-source';
import { ProfilePlatforms } from '@/components/profiles/profile-platforms';
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
      context.queryClient.prefetchQuery(
        context.trpc.profile.source.queryOptions({
          profileId: params.profileId,
          projectId: params.projectId,
        }),
      ),
      context.queryClient.prefetchQuery(
        context.trpc.profile.platforms.queryOptions({
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
        <div className="col-span-1 flex flex-col gap-3 md:col-span-2">
          <ProfileProperties profile={profile.data!} />
          {profile.data?.groups?.length ? (
            <ProfileGroups
              profileId={profileId}
              projectId={projectId}
              groups={profile.data.groups}
            />
          ) : null}
        </div>

        {/* Source (referrer + UTM attribution) */}
        <div className="col-span-1">
          <ProfileSource profileId={profileId} projectId={projectId} />
        </div>

        {/* Platforms (web vs app split, current app version) */}
        <div className="col-span-1">
          <ProfilePlatforms
            profileId={profileId}
            projectId={projectId}
          />
        </div>

        {/* Heatmap / Activity */}
        <div className="col-span-1 md:col-span-2">
          <ProfileActivity data={activity.data} />
        </div>

        {/* Latest events fills the left column; Popular events + Most
         * visited pages stack on the right so the bottom row never has
         * an awkward empty cell. */}
        <div className="col-span-1">
          <LatestEvents
            profileId={profileId}
            projectId={projectId}
            organizationId={organizationId}
          />
        </div>

        <div className="col-span-1 flex flex-col gap-6">
          <MostEvents data={mostEvents.data} />
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
