import { Suspense } from 'react';
import PageLayout from '@/app/(app)/[organizationSlug]/[projectId]/page-layout';
import { eventQueryFiltersParser } from '@/hooks/useEventQueryFilters';
import { parseAsInteger } from 'nuqs';

import LastActiveUsersServer from '../retention/last-active-users';
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
      <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
        <ProfileListServer
          projectId={projectId}
          cursor={parseAsInteger.parseServerSide(cursor ?? '') ?? undefined}
          filters={
            eventQueryFiltersParser.parseServerSide(f ?? '') ?? undefined
          }
        />
        <div className="flex flex-col gap-4">
          <LastActiveUsersServer projectId={projectId} />
          <ProfileTopServer
            projectId={projectId}
            organizationSlug={organizationSlug}
          />
        </div>
      </div>
    </>
  );
}
