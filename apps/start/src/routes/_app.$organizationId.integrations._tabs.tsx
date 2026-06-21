import FullPageLoadingState from '@/components/full-page-loading-state';
import { PageHeader } from '@/components/page-header';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePageTabs } from '@/hooks/use-page-tabs';
import i18n from '@/i18n';
import { createOrganizationTitle } from '@/utils/title';
import { Outlet, createFileRoute, useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

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
            i18n.t('integrations.page_title'),
            loaderData?.organization?.name,
          ),
        },
      ],
    };
  },
  pendingComponent: FullPageLoadingState,
});

function Component() {
  const router = useRouter();
  const { t } = useTranslation();

  const { activeTab, tabs } = usePageTabs([
    { id: 'installed', label: t('integrations.tab_installed') },
    { id: 'available', label: t('integrations.tab_available') },
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
        title={t('integrations.page_title')}
        description={t('integrations.page_description')}
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
