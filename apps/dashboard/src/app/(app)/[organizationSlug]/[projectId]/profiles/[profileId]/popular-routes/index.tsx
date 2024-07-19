import withLoadingWidget from '@/hocs/with-loading-widget';
import { escape } from 'sqlstring';

import { chQuery, TABLE_NAMES } from '@openpanel/db';

import PopularRoutes from './popular-routes';

type Props = {
  projectId: string;
  profileId: string;
};

const PopularRoutesServer = async ({ projectId, profileId }: Props) => {
  const data = await chQuery<{ count: number; path: string }>(
    `SELECT count(*) as count, path FROM ${TABLE_NAMES.events} WHERE name = 'screen_view' AND project_id = ${escape(projectId)} and profile_id = ${escape(profileId)} GROUP BY path ORDER BY count DESC`
  );
  return <PopularRoutes data={data} />;
};

export default withLoadingWidget(PopularRoutesServer);
