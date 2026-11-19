import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { AiUsageWidget } from '@/components/ai/ai-usage-widget';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { LatestEvents } from '@/components/profiles/latest-events';
import { MostEvents } from '@/components/profiles/most-events';
import { PopularRoutes } from '@/components/profiles/popular-routes';
import { ProfileActivity } from '@/components/profiles/profile-activity';
import { ProfileCharts } from '@/components/profiles/profile-charts';
import { ProfileGroups } from '@/components/profiles/profile-groups';
import { ProfileMetrics } from '@/components/profiles/profile-metrics';
import { ProfileProperties } from '@/components/profiles/profile-properties';
import { useTRPC } from '@/integrations/trpc/react';
import { createProjectTitle, PAGE_TITLES } from '@/utils/title';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/profiles/$profileId/_tabs/'
)({
  component: Component,
  loader: async ({ context, params }) => {
    // Prefetch all profile data
    await Promise.all([
      context.queryClient.prefetchQuery(
        context.trpc.profile.metrics.queryOptions({
          profileId: params.profileId,
          projectId: params.projectId,
        })
      ),
      context.queryClient.prefetchQuery(
        context.trpc.profile.activity.queryOptions({
          profileId: params.profileId,
          projectId: params.projectId,
        })
      ),
      context.queryClient.prefetchQuery(
        context.trpc.profile.mostEvents.queryOptions({
          profileId: params.profileId,
          projectId: params.projectId,
        })
      ),
      context.queryClient.prefetchQuery(
        context.trpc.profile.popularRoutes.queryOptions({
          profileId: params.profileId,
          projectId: params.projectId,
        })
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
    })
  );

  const metrics = useSuspenseQuery(
    trpc.profile.metrics.queryOptions({
      profileId,
      projectId,
    })
  );

  const activity = useSuspenseQuery(
    trpc.profile.activity.queryOptions({
      profileId,
      projectId,
    })
  );

  const mostEvents = useSuspenseQuery(
    trpc.profile.mostEvents.queryOptions({
      profileId,
      projectId,
    })
  );

  const popularRoutes = useSuspenseQuery(
    trpc.profile.popularRoutes.queryOptions({
      profileId,
      projectId,
    })
  );

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <aside className="col gap-6">
        <ProfileProperties profile={profile.data!} />
        {profile.data?.groups?.length ? (
          <ProfileGroups
            groups={profile.data.groups}
            profileId={profileId}
            projectId={projectId}
          />
        ) : null}
        <AiUsageWidget
          entity={{ kind: 'profile', profileId }}
          projectId={projectId}
        />
      </aside>

      <div className="col min-w-0 gap-6">
        <ProfileMetrics data={metrics.data} />
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <ProfileActivity data={activity.data} />
          <LatestEvents
            organizationId={organizationId}
            profileId={profileId}
            projectId={projectId}
          />
          <MostEvents data={mostEvents.data} />
          <PopularRoutes data={popularRoutes.data} />
          <ProfileCharts profileId={profileId} projectId={projectId} />
        </div>
      </div>
    </div>
  );
}
