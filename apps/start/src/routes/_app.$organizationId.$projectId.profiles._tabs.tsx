import { PageHeader } from '@/components/page-header';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePageTabs } from '@/hooks/use-page-tabs';
import { PAGE_TITLES, createProjectTitle } from '@/utils/title';
import { Outlet, createFileRoute, useRouter } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/profiles/_tabs',
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
        title="Profiles"
        description="If you haven't called identify your profiles will be anonymous"
      />

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
    </div>
  );
}
