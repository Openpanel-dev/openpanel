import { PageHeader } from '@/components/page-header';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Outlet,
  createFileRoute,
  useLocation,
  useRouter,
} from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_app/$organizationId_/$projectId_/settings/_tabs',
)({
  component: ProjectDashboard,
  loader: async ({ context, params }) => {
    const { trpc, queryClient } = context;
    await queryClient.prefetchQuery(
      trpc.project.getProjectWithClients.queryOptions({
        projectId: params.projectId,
      }),
    );
  },
});

function ProjectDashboard() {
  const router = useRouter();
  const location = useLocation();
  const tab = location.pathname.split('/').pop();

  const settingsTabs = [
    { id: 'details', label: 'Details' },
    { id: 'events', label: 'Events' },
    { id: 'clients', label: 'Clients' },
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
        title="Project settings"
        description="Manage your project settings here"
      />

      <Tabs value={tab} onValueChange={handleTabChange} className="mt-2 mb-8">
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
