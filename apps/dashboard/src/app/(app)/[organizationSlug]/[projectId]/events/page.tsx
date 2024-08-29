import { PageTabs, PageTabsItem } from '@/components/page-tabs';
import { Padding } from '@/components/ui/padding';
import { parseAsStringEnum } from 'nuqs';

import Charts from './charts';
import Conversions from './conversions';
import Events from './events';

interface PageProps {
  params: {
    projectId: string;
    organizationSlug: string;
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
            <PageTabsItem href={`?tab=events`} isActive={tab === 'events'}>
              Events
            </PageTabsItem>
            <PageTabsItem
              href={`?tab=conversions`}
              isActive={tab === 'conversions'}
            >
              Conversions
            </PageTabsItem>
            <PageTabsItem href={`?tab=charts`} isActive={tab === 'charts'}>
              Charts
            </PageTabsItem>
          </PageTabs>
        </div>
        {tab === 'events' && <Events projectId={projectId} />}
        {tab === 'conversions' && <Conversions projectId={projectId} />}
        {tab === 'charts' && <Charts projectId={projectId} />}
      </Padding>
    </>
  );
}
