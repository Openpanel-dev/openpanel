import { ActiveIntegrations } from '@/components/integrations/active-integrations';
import { AllIntegrations } from '@/components/integrations/all-integrations';
import { PageTabs, PageTabsLink } from '@/components/page-tabs';
import { Padding } from '@/components/ui/padding';
import { parseAsStringEnum } from 'nuqs/server';

interface PageProps {
  params: {
    projectId: string;
  };
  searchParams: {
    tab: string;
  };
}

export default function Page({
  params: { projectId },
  searchParams,
}: PageProps) {
  const tab = parseAsStringEnum(['installed', 'available'])
    .withDefault('available')
    .parseServerSide(searchParams.tab);
  return (
    <Padding>
      <PageTabs className="mb-4">
        <PageTabsLink href="?tab=available" isActive={tab === 'available'}>
          Available
        </PageTabsLink>
        <PageTabsLink href="?tab=installed" isActive={tab === 'installed'}>
          Installed
        </PageTabsLink>
      </PageTabs>
      {tab === 'installed' && <ActiveIntegrations />}
      {tab === 'available' && <AllIntegrations />}
    </Padding>
  );
}
