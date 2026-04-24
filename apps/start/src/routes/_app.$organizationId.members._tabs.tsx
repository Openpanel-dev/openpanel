import { PageHeader } from '@/components/page-header';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePageTabs } from '@/hooks/use-page-tabs';
import { PAGE_TITLES, createOrganizationTitle } from '@/utils/title';
import {
  Outlet,
  createFileRoute,
  redirect,
  useRouter,
} from '@tanstack/react-router';

export const Route = createFileRoute('/_app/$organizationId/members/_tabs')({
  component: Component,
  head: () => {
    return {
      meta: [
        {
          title: createOrganizationTitle(PAGE_TITLES.MEMBERS),
        },
      ],
    };
  },
  beforeLoad: async ({ params, context }) => {
    const access = await context.queryClient.fetchQuery(
      context.trpc.organization.myAccess.queryOptions({
        organizationId: params.organizationId,
      }),
    );
    if (access?.role !== 'org:admin') {
      throw redirect({
        to: '/$organizationId',
        params: { organizationId: params.organizationId },
      });
    }
  },
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
      to: tabId,
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
