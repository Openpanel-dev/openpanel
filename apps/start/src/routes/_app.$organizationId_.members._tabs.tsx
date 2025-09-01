import { PageHeader } from '@/components/page-header';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePageTabs } from '@/hooks/use-page-tabs';
import {
  Outlet,
  createFileRoute,
  useLocation,
  useRouter,
} from '@tanstack/react-router';

export const Route = createFileRoute('/_app/$organizationId_/members/_tabs')({
  component: Component,
});

function Component() {
  const router = useRouter();
  const { activeTab, tabs } = usePageTabs([
    { id: 'members', label: 'Members' },
    { id: 'invitations', label: 'Invitations' },
  ]);

  const handleTabChange = (tabId: string) => {
    router.navigate({
      from: Route.fullPath,
      to: tabId === 'members' ? '' : 'invitations',
    });
  };

  return (
    <div className="container p-8">
      <PageHeader title="Members" description="Manage your members here" />

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
