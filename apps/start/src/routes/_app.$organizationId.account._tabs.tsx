import { createFileRoute, Outlet, useRouter } from '@tanstack/react-router';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePageTabs } from '@/hooks/use-page-tabs';
import {
  useTranslation as useDashboardTranslation,
  useTranslation,
} from '@/i18n/provider';

export const Route = createFileRoute('/_app/$organizationId/account/_tabs')({
  component: Component,
  pendingComponent: FullPageLoadingState,
});

function Component() {
  const { t } = useTranslation();
  const { t: translateUi } = useDashboardTranslation();

  const router = useRouter();
  const { organizationId } = Route.useParams();
  const { activeTab, tabs } = usePageTabs([
    { id: 'account', label: t('Profile') },
    { id: 'email-preferences', label: t('Email preferences') },
    { id: 'two-factor', label: t('Two-factor auth') },
  ]);

  const handleTabChange = (tabId: string) => {
    if (tabId === 'account') {
      router.navigate({
        to: '/$organizationId/account',
        params: { organizationId },
      });
      return;
    }
    router.navigate({
      from: Route.fullPath,
      to: tabId,
    });
  };

  return (
    <PageContainer>
      <PageHeader title={translateUi('Your account')} />
      <Tabs
        className="mt-2 mb-8"
        onValueChange={handleTabChange}
        value={activeTab}
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
    </PageContainer>
  );
}
