import ClickToCopy from '@/components/click-to-copy';
import { ProfileAvatar } from '@/components/profiles/profile-avatar';
import { Padding } from '@/components/ui/padding';
import { getProfileName } from '@/utils/getters';
import { notFound } from 'next/navigation';

import { getProfileById, getProfileByIdCached } from '@openpanel/db';

import MostEventsServer from './most-events';
import PopularRoutesServer from './popular-routes';
import ProfileActivityServer from './profile-activity';
import ProfileCharts from './profile-charts';
import Events from './profile-events';
import ProfileMetrics from './profile-metrics';

interface PageProps {
  params: {
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
  const profile = await getProfileById(
    decodeURIComponent(profileId),
    projectId,
  );

  if (!profile) {
    return notFound();
  }

  return (
    <Padding>
      <div className="row mb-4 items-center gap-4">
        <ProfileAvatar {...profile} />
        <div className="min-w-0">
          <ClickToCopy value={profile.id}>
            <h1 className="max-w-full truncate text-3xl font-semibold">
              {getProfileName(profile)}
            </h1>
          </ClickToCopy>
        </div>
      </div>
      <div>
        <div className="grid grid-cols-6 gap-4">
          <div className="col-span-6">
            <ProfileMetrics projectId={projectId} profile={profile} />
          </div>
          <div className="col-span-6">
            <ProfileActivityServer
              profileId={profileId}
              projectId={projectId}
            />
          </div>
          <div className="col-span-6 md:col-span-3">
            <MostEventsServer profileId={profileId} projectId={projectId} />
          </div>
          <div className="col-span-6 md:col-span-3">
            <PopularRoutesServer profileId={profileId} projectId={projectId} />
          </div>

          <ProfileCharts profileId={profileId} projectId={projectId} />
        </div>
        <div className="mt-8">
          <Events profileId={profileId} projectId={projectId} />
        </div>
      </div>
    </Padding>
  );
}
