import {
  createFileRoute,
  Outlet,
  redirect,
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
  beforeLoad: async ({ params, context }) => {
    const access = await context.queryClient.fetchQuery(
      context.trpc.organization.myAccess.queryOptions({
        organizationId: params.organizationId,
      })
    );
    if (access?.role !== 'org:admin') {
      throw redirect({
        to: '/$organizationId/$projectId',
        params: {
          organizationId: params.organizationId,
          projectId: params.projectId,
        },
      });
    }
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
    { id: 'clients', label: 'Clients / API keys' },
    { id: 'tracking', label: 'Tracking script' },
    { id: 'mcp', label: 'MCP' },
    { id: 'widgets', label: 'Widgets' },
    { id: 'imports', label: 'Imports' },
    { id: 'gsc', label: 'Google Search' },
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
