import { PageHeader } from '@/components/page-header';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePageTabs } from '@/hooks/use-page-tabs';
import { useRangePageContext } from '@/hooks/use-page-context-helpers';
import i18n from '@/i18n';
import { createProjectTitle } from '@/utils/title';
import { Outlet, createFileRoute, useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/events/_tabs',
)({
  component: Component,
  head: () => {
    return {
      meta: [
        {
          title: createProjectTitle(i18n.t('events.page_title')),
        },
      ],
    };
  },
});

function Component() {
  const { t } = useTranslation();
  const router = useRouter();
  useRangePageContext('events');

  const { activeTab, tabs } = usePageTabs([
    { id: 'events', label: t('events.tab_events') },
    { id: 'conversions', label: t('events.tab_conversions') },
    { id: 'stats', label: t('events.tab_stats') },
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
        title={t('events.page_title')}
        description={t('events.page_description')}
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
