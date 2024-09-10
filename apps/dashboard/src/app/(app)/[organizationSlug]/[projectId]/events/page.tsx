import { PageTabs, PageTabsLink } from '@/components/page-tabs';
import { Padding } from '@/components/ui/padding';
import { parseAsStringEnum } from 'nuqs/server';

import Charts from './charts';
import Conversions from './conversions';
import Events from './events';

interface PageProps {
  params: {
    projectId: string;
  };
  searchParams: Record<string, string>;
}

export default function Page({
  params: { projectId },
  searchParams,
}: PageProps) {
  const tab = parseAsStringEnum(['events', 'conversions', 'charts'])
    .withDefault('events')
    .parseServerSide(searchParams.tab);

  return (
    <>
      <Padding>
        <div className="mb-4">
          <PageTabs>
            <PageTabsLink href={'?tab=events'} isActive={tab === 'events'}>
              Events
            </PageTabsLink>
            <PageTabsLink
              href={'?tab=conversions'}
              isActive={tab === 'conversions'}
            >
              Conversions
            </PageTabsLink>
            <PageTabsLink href={'?tab=charts'} isActive={tab === 'charts'}>
              Charts
            </PageTabsLink>
          </PageTabs>
        </div>
        {tab === 'events' && <Events projectId={projectId} />}
        {tab === 'conversions' && <Conversions projectId={projectId} />}
        {tab === 'charts' && <Charts projectId={projectId} />}
      </Padding>
    </>
  );
}
