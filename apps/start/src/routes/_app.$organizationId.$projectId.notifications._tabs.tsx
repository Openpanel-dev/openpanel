import { PageHeader } from '@/components/page-header';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePageTabs } from '@/hooks/use-page-tabs';
import i18n from '@/i18n';
import { PAGE_TITLES, createProjectTitle } from '@/utils/title';
import { Outlet, createFileRoute, useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/notifications/_tabs',
)({
  component: Component,
  head: () => {
    return {
      meta: [
        {
          title: createProjectTitle(i18n.t('notifications.page_title')),
        },
      ],
    };
  },
});

function Component() {
  const { t } = useTranslation();
  const router = useRouter();

  const { activeTab, tabs } = usePageTabs([
    { id: 'notifications', label: t('notifications.tab_notifications') },
    { id: 'rules', label: t('notifications.tab_rules') },
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
        title={t('notifications.page_title')}
        description={t('notifications.page_description')}
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
