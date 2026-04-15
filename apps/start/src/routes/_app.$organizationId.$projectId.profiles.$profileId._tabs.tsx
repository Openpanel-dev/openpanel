import FullPageLoadingState from '@/components/full-page-loading-state';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { ProfileAvatar } from '@/components/profiles/profile-avatar';
import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProjectLink } from '@/components/links';
import { usePageTabs } from '@/hooks/use-page-tabs';
import { useTRPC } from '@/integrations/trpc/react';
import { getProfileName } from '@/utils/getters';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Outlet, createFileRoute, useRouter } from '@tanstack/react-router';
import { ChevronRight, Flame } from 'lucide-react';

/** Threshold above which a profile is surfaced as a "Power User" in
 *  the page header. Matches the gut-feel threshold the Power Users
 *  tab uses to rank profiles — anything above 100 events is clearly
 *  an engaged user. Tweak as you learn what's typical for Pin Drop. */
const POWER_USER_EVENT_THRESHOLD = 100;

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/profiles/$profileId/_tabs',
)({
  component: Component,
  loader: async ({ context, params }) => {
    await context.queryClient.prefetchQuery(
      context.trpc.profile.byId.queryOptions({
        profileId: params.profileId,
        projectId: params.projectId,
      }),
    );
  },
  pendingComponent: FullPageLoadingState,
});

function Component() {
  const router = useRouter();
  const { profileId, projectId } = Route.useParams();
  const trpc = useTRPC();

  const profile = useSuspenseQuery(
    trpc.profile.byId.queryOptions({
      profileId,
      projectId,
    }),
  );

  // Metrics are already prefetched by the overview child route, so
  // this usually resolves instantly from the cache. Used only to
  // decide whether to show the "Power User" badge.
  const metrics = useQuery(
    trpc.profile.metrics.queryOptions({
      profileId,
      projectId,
    }),
  );

  const isPowerUser =
    !!metrics.data &&
    metrics.data.totalEvents >= POWER_USER_EVENT_THRESHOLD;

  // Breadcrumb parent: identified profiles for external users,
  // anonymous for everyone else.
  const parentTab = profile.data?.isExternal ? 'identified' : 'anonymous';
  const parentLabel = profile.data?.isExternal ? 'Identified' : 'Anonymous';

  const { activeTab, tabs } = usePageTabs([
    {
      id: '/$organizationId/$projectId/profiles/$profileId',
      label: 'Overview',
    },
    { id: 'events', label: 'Events' },
    { id: 'sessions', label: 'Sessions' },
  ]);

  const handleTabChange = (tabId: string) => {
    router.navigate({
      from: Route.fullPath,
      to: tabId,
    });
  };

  return (
    <PageContainer>
      {/* Breadcrumb — clickable trail back to the Profiles list so you
       * can get back to where you came from without relying on the
       * browser back button. */}
      <nav className="mb-2 flex items-center gap-1 text-sm text-muted-foreground">
        <ProjectLink href="/profiles/identified" className="hover:underline">
          Profiles
        </ProjectLink>
        <ChevronRight className="size-3.5" />
        <ProjectLink
          href={`/profiles/${parentTab}`}
          className="hover:underline"
        >
          {parentLabel}
        </ProjectLink>
        <ChevronRight className="size-3.5" />
        <span className="truncate text-foreground">
          {profile.data
            ? getProfileName(profile.data, false)
            : 'User not identified'}
        </span>
      </nav>

      <PageHeader
        title={
          <div className="row items-center gap-4 min-w-0">
            <ProfileAvatar {...profile.data} />
            <span className="truncate">
              {profile.data
                ? getProfileName(profile.data, false)
                : 'User not identified'}
            </span>
            {isPowerUser && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                <Flame className="size-3" />
                Power user
              </span>
            )}
          </div>
        }
      >
        <div className="row gap-4 mb-6 flex-wrap">
          {profile.data?.properties.country && (
            <div className="row gap-2 items-center">
              <SerieIcon name={profile.data.properties.country} />
              <span>
                {profile.data.properties.country}
                {profile.data.properties.city &&
                  ` / ${profile.data.properties.city}`}
              </span>
            </div>
          )}
          {profile.data?.properties.device && (
            <div className="row gap-2 items-center">
              <SerieIcon name={profile.data.properties.device} />
              <span className="capitalize">
                {profile.data.properties.device}
              </span>
            </div>
          )}
          {profile.data?.properties.os && (
            <div className="row gap-2 items-center">
              <SerieIcon name={profile.data.properties.os} />
              <span>{profile.data.properties.os}</span>
            </div>
          )}
          {profile.data?.properties.model && (
            <div className="row gap-2 items-center">
              <SerieIcon name={profile.data.properties.model} />
              <span>{profile.data.properties.model}</span>
            </div>
          )}
          {profile.data?.properties.browser && (
            <div className="row gap-2 items-center">
              <SerieIcon name={profile.data.properties.browser} />
              <span>{profile.data.properties.browser}</span>
            </div>
          )}
        </div>
      </PageHeader>

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="mt-2 mb-8"
      >
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Outlet />
    </PageContainer>
  );
}
