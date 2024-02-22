import PageLayout from '@/app/(app)/[organizationId]/[projectId]/page-layout';
import { OverviewFiltersButtons } from '@/components/overview/filters/overview-filters-buttons';
import { OverviewFiltersDrawer } from '@/components/overview/filters/overview-filters-drawer';
import { eventQueryFiltersParser } from '@/hooks/useEventQueryFilters';
import { getExists } from '@/server/pageExists';
import { parseAsInteger } from 'nuqs';

import { getProfileList, getProfileListCount } from '@mixan/db';

import { StickyBelowHeader } from '../layout-sticky-below-header';
import { ProfileList } from './profile-list';

interface PageProps {
  params: {
    organizationId: string;
    projectId: string;
  };
  searchParams: {
    f?: string;
    cursor?: string;
  };
}

const nuqsOptions = {
  shallow: false,
};

export default async function Page({
  params: { organizationId, projectId },
  searchParams: { cursor, f },
}: PageProps) {
  const [profiles, count] = await Promise.all([
    getProfileList({
      projectId,
      take: 50,
      cursor: parseAsInteger.parse(cursor ?? '') ?? undefined,
      filters: eventQueryFiltersParser.parse(f ?? '') ?? undefined,
    }),
    getProfileListCount({
      projectId,
      filters: eventQueryFiltersParser.parse(f ?? '') ?? undefined,
    }),
    getExists(organizationId, projectId),
  ]);

  return (
    <PageLayout title="Profiles" organizationSlug={organizationId}>
      <StickyBelowHeader className="p-4 flex justify-between">
        <OverviewFiltersDrawer
          projectId={projectId}
          nuqsOptions={nuqsOptions}
          mode="events"
        />
        <OverviewFiltersButtons
          className="p-0 justify-end"
          nuqsOptions={nuqsOptions}
        />
      </StickyBelowHeader>
      <ProfileList data={profiles} count={count} />
    </PageLayout>
  );
}
