'use client';

import { TableButtons } from '@/components/data-table';
import { EventsTable } from '@/components/events/table';
import { EventsTableColumns } from '@/components/events/table/events-table-columns';
import { OverviewFiltersButtons } from '@/components/overview/filters/overview-filters-buttons';
import { OverviewFiltersDrawer } from '@/components/overview/filters/overview-filters-drawer';
import { useEventQueryFilters } from '@/hooks/useEventQueryFilters';
import { api } from '@/trpc/client';
import { Loader2Icon } from 'lucide-react';

type Props = {
  projectId: string;
  profileId: string;
};

const Events = ({ projectId, profileId }: Props) => {
  const [filters] = useEventQueryFilters();
  const query = api.event.events.useInfiniteQuery(
    {
      projectId,
      filters,
      profileId,
    },
    {
      getNextPageParam: (lastPage) => lastPage.meta.next,
      keepPreviousData: true,
    },
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
        <EventsTableColumns />
        {query.isRefetching && (
          <div className="center-center size-8 rounded border bg-background">
            <Loader2Icon
              size={12}
              className="size-4 shrink-0 animate-spin text-black text-highlight"
            />
          </div>
        )}
      </TableButtons>
      <EventsTable query={query} />
    </div>
  );
};

export default Events;
