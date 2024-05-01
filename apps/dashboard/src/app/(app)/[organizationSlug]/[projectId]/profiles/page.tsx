import PageLayout from '@/app/(app)/[organizationSlug]/[projectId]/page-layout';
import { OverviewFiltersButtons } from '@/components/overview/filters/overview-filters-buttons';
import { OverviewFiltersDrawer } from '@/components/overview/filters/overview-filters-drawer';
import { eventQueryFiltersParser } from '@/hooks/useEventQueryFilters';
import { parseAsInteger } from 'nuqs';

import { StickyBelowHeader } from '../layout-sticky-below-header';
import ProfileLastSeenServer from './profile-last-seen';
import ProfileListServer from './profile-list';
import ProfileTopServer from './profile-top';

interface PageProps {
  params: {
    organizationSlug: string;
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

export default function Page({
  params: { organizationSlug, projectId },
  searchParams: { cursor, f },
}: PageProps) {
  return (
    <>
      <PageLayout title="Profiles" organizationSlug={organizationSlug} />
      {/* <StickyBelowHeader className="flex justify-between p-4">
        <OverviewFiltersDrawer
          projectId={projectId}
          nuqsOptions={nuqsOptions}
          mode="events"
        />
        <OverviewFiltersButtons
          className="justify-end p-0"
          nuqsOptions={nuqsOptions}
        />
      </StickyBelowHeader> */}
      <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
        <ProfileListServer
          projectId={projectId}
          cursor={parseAsInteger.parseServerSide(cursor ?? '') ?? undefined}
          filters={
            eventQueryFiltersParser.parseServerSide(f ?? '') ?? undefined
          }
        />
        <div className="flex flex-col gap-4">
          <ProfileLastSeenServer projectId={projectId} />
          <ProfileTopServer
            projectId={projectId}
            organizationSlug={organizationSlug}
          />
        </div>
      </div>
    </>
  );
}
