import withLoadingWidget from '@/hocs/with-loading-widget';
import { escape } from 'sqlstring';

import { chQuery, TABLE_NAMES } from '@openpanel/db';

import MostEvents from './most-events';

type Props = {
  projectId: string;
  profileId: string;
};

const MostEventsServer = async ({ projectId, profileId }: Props) => {
  const data = await chQuery<{ count: number; name: string }>(
    `SELECT count(*) as count, name FROM ${TABLE_NAMES.events} WHERE name NOT IN ('screen_view', 'session_start', 'session_end') AND project_id = ${escape(projectId)} and profile_id = ${escape(profileId)} GROUP BY name ORDER BY count DESC`
  );
  return <MostEvents data={data} />;
};

export default withLoadingWidget(MostEventsServer);
