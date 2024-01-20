'use client';

import { useMemo, useState } from 'react';
import { api } from '@/app/_trpc/client';
import { StickyBelowHeader } from '@/app/(app)/layout-sticky-below-header';
import { Pagination, usePagination } from '@/components/Pagination';
import { ComboboxAdvanced } from '@/components/ui/combobox-advanced';

import { EventListItem } from './event-list-item';

interface ListEventsProps {
  projectId: string;
}
export function ListEvents({ projectId }: ListEventsProps) {
  const pagination = usePagination();
  const [eventFilters, setEventFilters] = useState<string[]>([]);
  const eventsQuery = api.event.list.useQuery(
    {
      events: eventFilters,
      projectId: projectId,
      ...pagination,
    },
    {
      keepPreviousData: true,
    }
  );
  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery]);

  const filterEventsQuery = api.chart.events.useQuery({
    projectId: projectId,
  });
  const filterEvents = (filterEventsQuery.data ?? []).map((item) => ({
    value: item.name,
    label: item.name,
  }));

  return (
    <>
      <StickyBelowHeader className="p-4 flex justify-between">
        <div>
          <ComboboxAdvanced
            items={filterEvents}
            value={eventFilters}
            onChange={setEventFilters}
            placeholder="Filter by event"
          />
        </div>
      </StickyBelowHeader>
      <div className="p-4">
        <div className="flex flex-col gap-4">
          {events.map((item) => (
            <EventListItem key={item.id} {...item} />
          ))}
        </div>
        <div className="mt-2">
          <Pagination {...pagination} />
        </div>
      </div>
    </>
  );
}
