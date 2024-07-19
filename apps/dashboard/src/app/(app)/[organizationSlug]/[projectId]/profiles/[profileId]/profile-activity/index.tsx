import withLoadingWidget from '@/hocs/with-loading-widget';
import { escape } from 'sqlstring';

import { chQuery, TABLE_NAMES } from '@openpanel/db';

import ProfileActivity from './profile-activity';

type Props = {
  projectId: string;
  profileId: string;
};

const ProfileActivityServer = async ({ projectId, profileId }: Props) => {
  const data = await chQuery<{ count: number; date: string }>(
    `SELECT count(*) as count, toStartOfDay(created_at) as date FROM ${TABLE_NAMES.events} WHERE project_id = ${escape(projectId)} and profile_id = ${escape(profileId)} GROUP BY date ORDER BY date DESC`
  );
  return <ProfileActivity data={data} />;
};

export default withLoadingWidget(ProfileActivityServer);
