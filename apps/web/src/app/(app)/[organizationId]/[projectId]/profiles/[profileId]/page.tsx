import PageLayout from '@/app/(app)/page-layout';
import { ListProperties } from '@/components/events/ListProperties';
import { ProfileAvatar } from '@/components/profiles/ProfileAvatar';
import { Avatar } from '@/components/ui/avatar';
import { Widget, WidgetBody, WidgetHead } from '@/components/Widget';
import {
  getProfileById,
  getProfilesByExternalId,
} from '@/server/services/profile.service';
import { formatDateTime } from '@/utils/date';
import { getProfileName } from '@/utils/getters';

import ListProfileEvents from './list-profile-events';

interface PageProps {
  params: {
    organizationId: string;
    projectId: string;
    profileId: string;
  };
}

export default async function Page({
  params: { organizationId, projectId, profileId },
}: PageProps) {
  const profile = await getProfileById(profileId);
  const profiles = (
    await getProfilesByExternalId(profile.external_id, profile.project_id)
  ).filter((item) => item.id !== profile.id);
  return (
    <PageLayout
      title={
        <div className="flex items-center gap-2">
          <ProfileAvatar {...profile} size="sm" className="hidden sm:block" />
          {getProfileName(profile)}
        </div>
      }
      organizationId={organizationId}
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
