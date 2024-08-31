'use client';

import { ProfilesTable } from '@/components/profiles/table';
import { api } from '@/trpc/client';
import { parseAsInteger, useQueryState } from 'nuqs';

type Props = {
  projectId: string;
  profileId?: string;
};

const Events = ({ projectId }: Props) => {
  const [cursor, setCursor] = useQueryState(
    'cursor',
    parseAsInteger.withDefault(0)
  );
  const query = api.profile.list.useQuery(
    {
      cursor,
      projectId,
      take: 50,
      // filters,
    },
    {
      keepPreviousData: true,
    }
  );

  return (
    <div>
      <ProfilesTable query={query} cursor={cursor} setCursor={setCursor} />
    </div>
  );
};

export default Events;
