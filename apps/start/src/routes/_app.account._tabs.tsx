import FullPageLoadingState from '@/components/full-page-loading-state';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePageTabs } from '@/hooks/use-page-tabs';
import { Outlet, createFileRoute, useRouter } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/account/_tabs')({
  component: Component,
  pendingComponent: FullPageLoadingState,
});

function Component() {
  const router = useRouter();
  const { activeTab, tabs } = usePageTabs([
    { id: 'account', label: 'Profile' },
    { id: 'email-preferences', label: 'Email preferences' },
    { id: 'two-factor', label: 'Two-factor auth' },
  ]);

  const handleTabChange = (tabId: string) => {
    if (tabId === 'account') {
      router.navigate({ to: '/account' });
      return;
    }
    router.navigate({
      from: Route.fullPath,
      to: tabId,
    });
  };

  return (
    <PageContainer>
      <PageHeader title="Your account" />
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
