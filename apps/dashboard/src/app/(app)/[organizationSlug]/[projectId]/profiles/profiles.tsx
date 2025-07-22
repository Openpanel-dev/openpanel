'use client';

import { TableButtons } from '@/components/data-table';
import { OverviewFiltersButtons } from '@/components/overview/filters/overview-filters-buttons';
import { OverviewFiltersDrawer } from '@/components/overview/filters/overview-filters-drawer';
import { ProfilesTable } from '@/components/profiles/table';
import { Input } from '@/components/ui/input';
import { useDebounceValue } from '@/hooks/useDebounceValue';
import { useEventQueryFilters, useEventQueryNamesFilter } from '@/hooks/useEventQueryFilters';
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
  const [events, setEvents] = useEventQueryNamesFilter();
  const [filters] = useEventQueryFilters();
  
  const debouncedSearch = useDebounceValue(search, 500);
  const query = api.profile.list.useQuery(
    {
      cursor,
      projectId,
      take: 50,
      search: debouncedSearch,
      events: events.length > 0 ? events : undefined,
      filters: filters.length > 0 ? filters : undefined,
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
        <OverviewFiltersDrawer
          projectId={projectId}
          mode="profiles"
          enableEventsFilter
        />
        <OverviewFiltersButtons className="justify-end p-0" />
      </TableButtons>
      <ProfilesTable query={query} cursor={cursor} setCursor={setCursor} />
    </div>
  );
};

export default Events;
