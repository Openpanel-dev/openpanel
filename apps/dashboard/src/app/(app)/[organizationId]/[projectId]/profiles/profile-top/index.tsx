import { ListPropertiesIcon } from '@/components/events/list-properties-icon';
import { ProfileAvatar } from '@/components/profiles/profile-avatar';
import { Widget, WidgetHead } from '@/components/widget';
import { WidgetTable } from '@/components/widget-table';
import { getProfileName } from '@/utils/getters';
import Link from 'next/link';

import { chQuery, getProfiles } from '@openpanel/db';

interface Props {
  projectId: string;
  organizationId: string;
}

export default async function ProfileTopServer({
  organizationId,
  projectId,
}: Props) {
  // Days since last event from users
  // group by days
  const res = await chQuery<{ profile_id: string; count: number }>(
    `SELECT profile_id, count(*) as count from events where profile_id != '' and project_id = '${projectId}' group by profile_id order by count() DESC LIMIT 10`
  );
  const profiles = await getProfiles({ ids: res.map((r) => r.profile_id) });
  const list = res.map((item) => {
    return {
      count: item.count,
      ...(profiles.find((p) => p.id === item.profile_id)! ?? {}),
    };
  });

  return (
    <Widget className="w-full">
      <WidgetHead>
        <div className="title">Power users</div>
      </WidgetHead>
      <WidgetTable
        data={list.filter((item) => !!item.id)}
        keyExtractor={(item) => item.id}
        columns={[
          {
            name: 'Name',
            render(profile) {
              return (
                <Link
                  href={`/${organizationId}/${projectId}/profiles/${profile.id}`}
                  className="flex items-center gap-2 font-medium"
                >
                  <ProfileAvatar size="sm" {...profile} />
                  {getProfileName(profile)}
                </Link>
              );
            },
          },
          {
            name: '',
            render(profile) {
              return <ListPropertiesIcon {...profile.properties} />;
            },
          },
          {
            name: 'Events',
            render(profile) {
              return profile.count;
            },
          },
        ]}
      />
    </Widget>
  );
}
