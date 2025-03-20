'use client';

import { TableButtons } from '@/components/data-table';
import EventListener from '@/components/events/event-listener';
import { EventsTable } from '@/components/events/table';
import { OverviewFiltersButtons } from '@/components/overview/filters/overview-filters-buttons';
import { OverviewFiltersDrawer } from '@/components/overview/filters/overview-filters-drawer';
import { Button } from '@/components/ui/button';
import { useEventQueryFilters } from '@/hooks/useEventQueryFilters';
import { pushModal } from '@/modals';
import { api } from '@/trpc/client';
import { format } from 'date-fns';
import { CalendarIcon, Loader2Icon } from 'lucide-react';
import { parseAsIsoDateTime, useQueryState } from 'nuqs';

type Props = {
  projectId: string;
  profileId?: string;
};

const Events = ({ projectId, profileId }: Props) => {
  const [filters] = useEventQueryFilters();
  const [startDate, setStartDate] = useQueryState(
    'startDate',
    parseAsIsoDateTime,
  );

  const [endDate, setEndDate] = useQueryState('endDate', parseAsIsoDateTime);
  const query = api.event.events.useInfiniteQuery(
    {
      projectId,
      filters,
      profileId,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    },
    {
      getNextPageParam: (lastPage) => lastPage.meta.next,
      keepPreviousData: true,
    },
  );

  return (
    <div>
      <TableButtons>
        <EventListener onRefresh={() => query.refetch()} />
        <Button
          variant="outline"
          size="sm"
          icon={CalendarIcon}
          onClick={() => {
            pushModal('DateRangerPicker', {
              onChange: ({ startDate, endDate }) => {
                setStartDate(startDate);
                setEndDate(endDate);
              },
              startDate: startDate || undefined,
              endDate: endDate || undefined,
            });
          }}
        >
          {startDate && endDate
            ? `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d')}`
            : 'Date range'}
        </Button>
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
      <EventsTable query={query} />
    </div>
  );
};

export default Events;
