import PageLayout from '@/app/(app)/[organizationId]/[projectId]/page-layout';
import { ListProperties } from '@/components/events/ListProperties';
import { ProfileAvatar } from '@/components/profiles/ProfileAvatar';
import { Widget, WidgetBody, WidgetHead } from '@/components/Widget';
import { getExists } from '@/server/pageExists';
import { formatDateTime } from '@/utils/date';
import { getProfileName } from '@/utils/getters';

import { getProfileById, getProfilesByExternalId } from '@mixan/db';

import ListProfileEvents from './list-profile-events';

interface PageProps {
  params: {
    projectId: string;
    profileId: string;
    organizationId: string;
  };
}

export default async function Page({
  params: { projectId, profileId, organizationId },
}: PageProps) {
  const [profile] = await Promise.all([
    getProfileById(profileId),
    getExists(organizationId, projectId),
  ]);
  const profiles = (
    await getProfilesByExternalId(profile.external_id, profile.project_id)
  ).filter((item) => item.id !== profile.id);
  return (
    <PageLayout
      organizationSlug={organizationId}
      title={
        <div className="flex items-center gap-2">
          <ProfileAvatar {...profile} size="sm" className="hidden sm:block" />
          {getProfileName(profile)}
        </div>
      }
    >
      <div className="p-4">
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 mb-8">
          <Widget>
            <WidgetHead>
              <span className="title">Properties</span>
            </WidgetHead>
            <ListProperties
              data={profile.properties}
              className="rounded-none border-none"
            />
          </Widget>
          <Widget>
            <WidgetHead>
              <span className="title">Linked profile</span>
            </WidgetHead>
            {profiles.length > 0 ? (
              <div className="flex flex-col gap-4">
                {profiles.map((profile) => (
                  <div key={profile.id} className="border-b border-border">
                    <WidgetBody className="flex gap-4">
                      <ProfileAvatar {...profile} />
                      <div>
                        <div className="font-medium mt-1">
                          {getProfileName(profile)}
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-muted-foreground text-xs">
                          <span>{profile.id}</span>
                          <span>{formatDateTime(profile.createdAt)}</span>
                        </div>
                      </div>
                    </WidgetBody>
                    <ListProperties
                      data={profile.properties}
                      className="rounded-none border-none"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4">No linked profiles</div>
            )}
          </Widget>
        </div>
        <ListProfileEvents projectId={projectId} profileId={profileId} />
      </div>
    </PageLayout>
  );
}
