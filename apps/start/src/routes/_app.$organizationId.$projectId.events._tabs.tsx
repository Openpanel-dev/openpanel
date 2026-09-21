import { createFileRoute, Outlet, useRouter } from '@tanstack/react-router';
import { PageHeader } from '@/components/page-header';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRangePageContext } from '@/hooks/use-page-context-helpers';
import { usePageTabs } from '@/hooks/use-page-tabs';
import { createProjectTitle, PAGE_TITLES } from '@/utils/title';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/events/_tabs'
)({
  component: Component,
  head: () => {
    return {
      meta: [
        {
          title: createProjectTitle(PAGE_TITLES.EVENTS),
        },
      ],
    };
  },
});

function Component() {
  const router = useRouter();
  useRangePageContext('events');

  const { activeTab, tabs } = usePageTabs([
    { id: 'events', label: 'Events' },
    { id: 'conversions', label: 'Conversions' },
    { id: 'stats', label: 'Stats' },
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
        description="Paginate through your events, conversions and overall stats"
        title="Events"
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
