import { PageTabs, PageTabsLink } from '@/components/page-tabs';
import { Padding } from '@/components/ui/padding';
import { parseAsStringEnum } from 'nuqs/server';

import { Pages } from './pages';

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
  const tab = parseAsStringEnum(['pages', 'trends'])
    .withDefault('pages')
    .parseServerSide(searchParams.tab);

  return (
    <Padding>
      <PageTabs className="mb-4">
        <PageTabsLink href="?tab=pages" isActive={tab === 'pages'}>
          Pages
        </PageTabsLink>
      </PageTabs>
      {tab === 'pages' && <Pages projectId={projectId} />}
    </Padding>
  );
}
