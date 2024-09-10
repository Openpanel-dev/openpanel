import { PageTabs, PageTabsLink } from '@/components/page-tabs';
import { Padding } from '@/components/ui/padding';
import { parseAsStringEnum } from 'nuqs/server';

import PowerUsers from './power-users';
import Profiles from './profiles';

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
  const tab = parseAsStringEnum(['profiles', 'power-users'])
    .withDefault('profiles')
    .parseServerSide(searchParams.tab);

  return (
    <>
      <Padding>
        <div className="mb-4">
          <PageTabs>
            <PageTabsLink href={'?tab=profiles'} isActive={tab === 'profiles'}>
              Profiles
            </PageTabsLink>
            <PageTabsLink
              href={'?tab=power-users'}
              isActive={tab === 'power-users'}
            >
              Power users
            </PageTabsLink>
          </PageTabs>
        </div>
        {tab === 'profiles' && <Profiles projectId={projectId} />}
        {tab === 'power-users' && <PowerUsers projectId={projectId} />}
      </Padding>
    </>
  );
}
