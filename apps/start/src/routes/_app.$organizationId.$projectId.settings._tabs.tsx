import {
  createFileRoute,
  Outlet,
  useLocation,
  useRouter,
} from '@tanstack/react-router';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { PageHeader } from '@/components/page-header';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { createProjectTitle, PAGE_TITLES } from '@/utils/title';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/settings/_tabs'
)({
  component: ProjectDashboard,
  head: () => {
    return {
      meta: [
        {
          title: createProjectTitle(PAGE_TITLES.SETTINGS),
        },
      ],
    };
  },
  loader: async ({ context, params }) => {
    const { trpc, queryClient } = context;
    await queryClient.prefetchQuery(
      trpc.project.getProjectWithClients.queryOptions({
        projectId: params.projectId,
      })
    );
  },
  pendingComponent: FullPageLoadingState,
});

function ProjectDashboard() {
  const router = useRouter();
  const location = useLocation();
  const tab = location.pathname.split('/').pop();

  const settingsTabs = [
    { id: 'details', label: 'Details' },
    { id: 'events', label: 'Events' },
    { id: 'clients', label: 'Clients' },
    { id: 'tracking', label: 'Tracking script' },
    { id: 'widgets', label: 'Widgets' },
    { id: 'imports', label: 'Imports' },
  ];

  const handleTabChange = (tabId: string) => {
    router.navigate({
      from: Route.fullPath,
      to: `/$organizationId/$projectId/settings/${tabId}`,
    });
  };

  return (
    <div className="container p-8">
      <PageHeader
        description="Manage your project settings here"
        title="Project settings"
      />

      <Tabs className="mt-2 mb-8" onValueChange={handleTabChange} value={tab}>
        <TabsList>
          {settingsTabs.map((tab) => (
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
