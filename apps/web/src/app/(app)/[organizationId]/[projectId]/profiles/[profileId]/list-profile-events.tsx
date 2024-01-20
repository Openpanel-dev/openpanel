'use client';

import { useMemo } from 'react';
import { api } from '@/app/_trpc/client';
import { Pagination, usePagination } from '@/components/Pagination';
import { ComboboxAdvanced } from '@/components/ui/combobox-advanced';
import { useEventNames } from '@/hooks/useEventNames';
import { parseAsJson, useQueryState } from 'nuqs';

import { EventListItem } from '../../events/event-list-item';

interface ListProfileEvents {
  projectId: string;
  profileId: string;
}

export default function ListProfileEvents({
  projectId,
  profileId,
}: ListProfileEvents) {
  const pagination = usePagination();
  const [eventFilters, setEventFilters] = useQueryState(
    'events',
    parseAsJson<string[]>().withDefault([])
  );

  const eventNames = useEventNames(projectId);
  const eventsQuery = api.event.list.useQuery(
    {
      projectId,
      profileId,
      events: eventFilters,
      ...pagination,
    },
    {
      keepPreviousData: true,
    }
  );
  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery]);

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <ComboboxAdvanced
          placeholder="Filter events"
          items={eventNames}
          value={eventFilters}
          onChange={setEventFilters}
        />
      </div>
      <div className="flex flex-col gap-4">
        {events.map((item) => (
          <EventListItem key={item.id} {...item} />
        ))}
      </div>
      <div className="mt-2">
        <Pagination {...pagination} />
      </div>
    </>
  );
}
