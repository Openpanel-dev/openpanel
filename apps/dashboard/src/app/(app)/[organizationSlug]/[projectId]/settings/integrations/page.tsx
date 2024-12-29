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
    <Padding className="col gap-8">
      <div className="col gap-4">
        <h2 className="text-3xl font-semibold">Your integrations</h2>
        <ActiveIntegrations />
      </div>

      <div className="col gap-4">
        <h2 className="text-3xl font-semibold">Available integrations</h2>
        <AllIntegrations />
      </div>
    </Padding>
  );
}
