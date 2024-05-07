import withLoadingWidget from '@/hocs/with-loading-widget';

import { getProfileList, getProfileListCount } from '@openpanel/db';
import type { IChartEventFilter } from '@openpanel/validation';

import { ProfileList } from './profile-list';

interface Props {
  projectId: string;
  cursor?: number;
  filters?: IChartEventFilter[];
}

const limit = 50;

async function ProfileListServer({ projectId, cursor, filters }: Props) {
  const [profiles, count] = await Promise.all([
    getProfileList({
      projectId,
      take: limit,
      cursor,
      filters,
    }),
    getProfileListCount({
      projectId,
      filters,
    }),
  ]);
  return <ProfileList data={profiles} count={count} limit={limit} />;
}

export default withLoadingWidget(ProfileListServer);
