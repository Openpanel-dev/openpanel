import { ListPropertiesIcon } from '@/components/events/list-properties-icon';
import { ProfileAvatar } from '@/components/profiles/profile-avatar';
import { Widget, WidgetHead } from '@/components/widget';
import { WidgetTable } from '@/components/widget-table';
import withLoadingWidget from '@/hocs/with-loading-widget';
import { getProfileName } from '@/utils/getters';
import Link from 'next/link';
import { escape } from 'sqlstring';

import { chQuery, getProfiles, TABLE_NAMES } from '@openpanel/db';

interface Props {
  projectId: string;
  organizationSlug: string;
}

async function ProfileTopServer({ organizationSlug, projectId }: Props) {
  // Days since last event from users
  // group by days
  const res = await chQuery<{ profile_id: string; count: number }>(
    `SELECT profile_id, count(*) as count from ${TABLE_NAMES.events} where profile_id != '' and project_id = ${escape(projectId)} group by profile_id order by count() DESC LIMIT 50`
  );
  const profiles = await getProfiles(res.map((r) => r.profile_id));
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
                  href={`/${organizationSlug}/${projectId}/profiles/${profile.id}`}
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

export default withLoadingWidget(ProfileTopServer);
