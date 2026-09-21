import { createFileRoute, Outlet, useRouter } from '@tanstack/react-router';
import { PageHeader } from '@/components/page-header';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePageTabs } from '@/hooks/use-page-tabs';
import { createProjectTitle, PAGE_TITLES } from '@/utils/title';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/profiles/_tabs'
)({
  component: Component,
  head: () => {
    return {
      meta: [
        {
          title: createProjectTitle(PAGE_TITLES.PROFILES),
        },
      ],
    };
  },
});

function Component() {
  const router = useRouter();

  const { activeTab, tabs } = usePageTabs([
    { id: 'identified', label: 'Identified' },
    { id: 'anonymous', label: 'Anonymous' },
    { id: 'power-users', label: 'Power users' },
  ]);

  const handleTabChange = (tabId: string) => {
    console.log('tabId', tabId, tabs[0].id === tabId);
    router.navigate({
      from: Route.fullPath,
      to: tabId,
    });
  };

  return (
    <div className="container p-8">
      <PageHeader
        description="If you haven't called identify your profiles will be anonymous"
        title="Profiles"
      />

      <Tabs
        className="mt-2 mb-8"
        onValueChange={handleTabChange}
        value={activeTab}
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
    </div>
  );
}
