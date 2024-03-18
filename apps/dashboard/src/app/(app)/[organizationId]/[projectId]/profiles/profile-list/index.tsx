import { getProfileList, getProfileListCount } from '@openpanel/db';
import type { IChartEventFilter } from '@openpanel/validation';

import { ProfileList } from './profile-list';

interface Props {
  projectId: string;
  cursor?: number;
  filters?: IChartEventFilter[];
}

export default async function ProfileListServer({
  projectId,
  cursor,
  filters,
}: Props) {
  const [profiles, count] = await Promise.all([
    getProfileList({
      projectId,
      take: 10,
      cursor,
      filters,
    }),
    getProfileListCount({
      projectId,
      filters,
    }),
  ]);
  return <ProfileList data={profiles} count={count} />;
}
