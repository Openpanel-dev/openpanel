import FullPageLoadingState from '@/components/full-page-loading-state';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { ProfileAvatar } from '@/components/profiles/profile-avatar';
import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePageTabs } from '@/hooks/use-page-tabs';
import { useTRPC } from '@/integrations/trpc/react';
import { getProfileName } from '@/utils/getters';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Outlet, createFileRoute, useRouter } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/$organizationId/profile/_tabs')({
  component: Component,
  pendingComponent: FullPageLoadingState,
});

function Component() {
  const router = useRouter();
  const { activeTab, tabs } = usePageTabs([
    {
      id: '/$organizationId/profile',
      label: 'Profile',
    },
    { id: 'email-preferences', label: 'Email preferences' },
  ]);

  const handleTabChange = (tabId: string) => {
    router.navigate({
      from: Route.fullPath,
      to: tabId,
    });
  };

  return (
    <PageContainer>
      <PageHeader title={'Your profile'} />

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
