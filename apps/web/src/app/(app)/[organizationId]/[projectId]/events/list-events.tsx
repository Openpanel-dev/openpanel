'use client';

import { useMemo, useState } from 'react';
import { api } from '@/app/_trpc/client';
import { StickyBelowHeader } from '@/app/(app)/[organizationId]/[projectId]/layout-sticky-below-header';
import { FullPageEmptyState } from '@/components/FullPageEmptyState';
import { Pagination, usePagination } from '@/components/Pagination';
import { ComboboxAdvanced } from '@/components/ui/combobox-advanced';
import { GanttChartIcon } from 'lucide-react';
import { parseAsArrayOf, parseAsString, useQueryState } from 'nuqs';

import { EventListItem } from './event-list-item';

interface ListEventsProps {
  projectId: string;
}
export function ListEvents({ projectId }: ListEventsProps) {
  const pagination = usePagination();
  const [eventFilters, setEventFilters] = useQueryState(
    'events',
    parseAsArrayOf(parseAsString).withDefault([])
  );
  const eventsQuery = api.event.list.useQuery({
    events: eventFilters,
    projectId: projectId,
    ...pagination,
  });
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
        {events.length === 0 ? (
          <FullPageEmptyState title="No events here" icon={GanttChartIcon}>
            {eventFilters.length ? (
              <p>Could not find any events with your filter</p>
            ) : (
              <p>We have not recieved any events yet</p>
            )}
          </FullPageEmptyState>
        ) : (
          <>
            <div className="flex flex-col gap-4">
              {events.map((item) => (
                <EventListItem key={item.createdAt.toString()} {...item} />
              ))}
            </div>
            <div className="mt-2">
              <Pagination {...pagination} />
            </div>
          </>
        )}
      </div>
    </>
  );
}
