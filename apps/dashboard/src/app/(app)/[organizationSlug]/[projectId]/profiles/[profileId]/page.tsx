import PageLayout from '@/app/(app)/[organizationSlug]/[projectId]/page-layout';
import ClickToCopy from '@/components/click-to-copy';
import { ListPropertiesIcon } from '@/components/events/list-properties-icon';
import { ProfileAvatar } from '@/components/profiles/profile-avatar';
import {
  eventQueryFiltersParser,
  eventQueryNamesFilter,
} from '@/hooks/useEventQueryFilters';
import { getProfileName } from '@/utils/getters';
import { notFound } from 'next/navigation';
import { parseAsInteger } from 'nuqs';

import type { GetEventListOptions } from '@openpanel/db';
import { getProfileById } from '@openpanel/db';

import { StickyBelowHeader } from '../../layout-sticky-below-header';
import MostEventsServer from './most-events';
import PopularRoutesServer from './popular-routes';
import ProfileActivityServer from './profile-activity';
import ProfileCharts from './profile-charts';
import Events from './profile-events';
import ProfileMetrics from './profile-metrics';

interface PageProps {
  params: {
    organizationSlug: string;
    projectId: string;
    profileId: string;
  };
  searchParams: {
    events?: string;
    cursor?: string;
    f?: string;
    startDate: string;
    endDate: string;
  };
}

export default async function Page({
  params: { projectId, profileId },
}: PageProps) {
  const profile = await getProfileById(profileId, projectId);

  if (!profile) {
    return notFound();
  }

  return (
    <>
      <StickyBelowHeader className="!relative !top-auto !z-0 flex flex-col gap-8 p-4 md:flex-row md:items-center md:p-8">
        <div className="flex flex-1 gap-4">
          <ProfileAvatar {...profile} size={'lg'} />
          <div className="min-w-0">
            <ClickToCopy value={profile.id}>
              <h1 className="max-w-full overflow-hidden text-ellipsis break-words text-lg font-semibold md:max-w-sm md:whitespace-nowrap md:text-2xl">
                {getProfileName(profile)}
              </h1>
            </ClickToCopy>
            <div className="mt-1 flex items-center gap-4">
              <ListPropertiesIcon {...profile.properties} />
            </div>
          </div>
        </div>
        <ProfileMetrics profileId={profileId} projectId={projectId} />
      </StickyBelowHeader>
      <div className="p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
          <div className="col-span-2">
            <ProfileActivityServer
              profileId={profileId}
              projectId={projectId}
            />
          </div>
          <div className="col-span-2">
            <MostEventsServer profileId={profileId} projectId={projectId} />
          </div>
          <div className="col-span-2">
            <PopularRoutesServer profileId={profileId} projectId={projectId} />
          </div>

          <ProfileCharts profileId={profileId} projectId={projectId} />
        </div>
        <div className="mt-8">
          <Events profileId={profileId} projectId={projectId} />
        </div>
      </div>
    </>
  );
}
