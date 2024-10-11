'use client';

import { TableButtons } from '@/components/data-table';
import { ProfilesTable } from '@/components/profiles/table';
import { Input } from '@/components/ui/input';
import { useDebounceValue } from '@/hooks/useDebounceValue';
import { api } from '@/trpc/client';
import { parseAsInteger, useQueryState } from 'nuqs';

type Props = {
  projectId: string;
  profileId?: string;
};

const Events = ({ projectId }: Props) => {
  const [cursor, setCursor] = useQueryState(
    'cursor',
    parseAsInteger.withDefault(0),
  );
  const [search, setSearch] = useQueryState('search', {
    defaultValue: '',
    shallow: true,
  });
  const debouncedSearch = useDebounceValue(search, 500);
  const query = api.profile.list.useQuery(
    {
      cursor,
      projectId,
      take: 50,
      search: debouncedSearch,
    },
    {
      keepPreviousData: true,
    },
  );

  return (
    <div>
      <TableButtons>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search profiles"
        />
      </TableButtons>
      <ProfilesTable query={query} cursor={cursor} setCursor={setCursor} />
    </div>
  );
};

export default Events;
