import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { ProfileAvatar } from '@/components/profiles/profile-avatar';
import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePageTabs } from '@/hooks/use-page-tabs';
import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';
import { getProfileName } from '@/utils/getters';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Outlet, createFileRoute, useRouter } from '@tanstack/react-router';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { useState } from 'react';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId_/profiles/$profileId/_tabs',
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

  const { activeTab, tabs } = usePageTabs([
    {
      id: '/$organizationId/$projectId/profiles/$profileId',
      label: 'Overview',
    },
    { id: 'events', label: 'Events' },
  ]);

  const handleTabChange = (tabId: string) => {
    router.navigate({
      from: Route.fullPath,
      to: tabId,
    });
  };

  return (
    <PageContainer>
      <PageHeader
        title={
          <div className="row items-center gap-4">
            <ProfileAvatar {...profile.data} />
            {getProfileName(profile.data, false)}
          </div>
        }
      >
        <div className="row gap-4 mb-6">
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
