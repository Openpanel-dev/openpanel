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
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const router = useRouter();
  const location = useLocation();
  const tab = location.pathname.split('/').pop();

  const settingsTabs = [
    { id: 'details', label: t('settings.tab_details') },
    { id: 'events', label: t('settings.tab_events') },
    { id: 'clients', label: t('settings.tab_clients_api_keys') },
    { id: 'tracking', label: t('settings.tab_tracking_script') },
    { id: 'mcp', label: t('settings.tab_mcp') },
    { id: 'widgets', label: t('settings.tab_widgets') },
    { id: 'imports', label: t('settings.tab_imports') },
    { id: 'gsc', label: t('settings.tab_google_search') },
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
        description={t('settings.project_settings_description')}
        title={t('settings.project_settings_title')}
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
