'use client';

import { TableButtons } from '@/components/data-table';
import { EventsTable } from '@/components/events/table';
import { OverviewFiltersButtons } from '@/components/overview/filters/overview-filters-buttons';
import { OverviewFiltersDrawer } from '@/components/overview/filters/overview-filters-drawer';
import {
  useEventQueryFilters,
  useEventQueryNamesFilter,
} from '@/hooks/useEventQueryFilters';
import { api } from '@/trpc/client';
import { Loader2Icon } from 'lucide-react';
import { parseAsInteger, useQueryState } from 'nuqs';

import { GetEventListOptions } from '@openpanel/db';

type Props = {
  projectId: string;
  profileId: string;
};

const Events = ({ projectId, profileId }: Props) => {
  const [filters] = useEventQueryFilters();
  const [eventNames] = useEventQueryNamesFilter();
  const [cursor, setCursor] = useQueryState(
    'cursor',
    parseAsInteger.withDefault(0)
  );
  const query = api.event.events.useQuery(
    {
      cursor,
      projectId,
      take: 50,
      events: eventNames,
      filters,
      profileId,
    },
    {
      keepPreviousData: true,
    }
  );

  return (
    <div>
      <TableButtons>
        <OverviewFiltersDrawer
          mode="events"
          projectId={projectId}
          enableEventsFilter
        />
        <OverviewFiltersButtons className="justify-end p-0" />
        {query.isRefetching && (
          <div className="center-center size-8 rounded border bg-background">
            <Loader2Icon
              size={12}
              className="size-4 shrink-0 animate-spin text-black text-highlight"
            />
          </div>
        )}
      </TableButtons>
      <EventsTable query={query} cursor={cursor} setCursor={setCursor} />
    </div>
  );
};

export default Events;
