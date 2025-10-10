import { PageHeader } from '@/components/page-header';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePageTabs } from '@/hooks/use-page-tabs';
import { PAGE_TITLES, createOrganizationTitle } from '@/utils/title';
import { Outlet, createFileRoute, useRouter } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_app/$organizationId/integrations/_tabs',
)({
  component: Component,
  loader: async ({ context, params }) => {
    const organization = await context.queryClient.fetchQuery(
      context.trpc.organization.get.queryOptions({
        organizationId: params.organizationId,
      }),
    );
    return { organization };
  },
  head: ({ loaderData }) => {
    return {
      meta: [
        {
          title: createOrganizationTitle(
            PAGE_TITLES.INTEGRATIONS,
            loaderData?.organization?.name,
          ),
        },
      ],
    };
  },
});

function Component() {
  const router = useRouter();

  const { activeTab, tabs } = usePageTabs([
    { id: 'installed', label: 'Installed' },
    { id: 'available', label: 'Available' },
  ]);

  const handleTabChange = (tabId: string) => {
    router.navigate({
      from: Route.fullPath,
      to: tabId,
    });
  };

  return (
    <div className="container p-8">
      <PageHeader
        title="Integrations"
        description="Manage your integrations here"
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
