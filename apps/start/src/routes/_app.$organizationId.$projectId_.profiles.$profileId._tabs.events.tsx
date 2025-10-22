import { EventsTable } from '@/components/events/table';
import { useReadColumnVisibility } from '@/components/ui/data-table/data-table-hooks';
import {
  useEventQueryFilters,
  useEventQueryNamesFilter,
} from '@/hooks/use-event-query-filters';
import { useTRPC } from '@/integrations/trpc/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { parseAsIsoDateTime, useQueryState } from 'nuqs';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId_/profiles/$profileId/_tabs/events',
)({
  component: Component,
});

function Component() {
  const { projectId, profileId } = Route.useParams();
  const trpc = useTRPC();
  const [filters] = useEventQueryFilters();
  const [startDate] = useQueryState('startDate', parseAsIsoDateTime);
  const [endDate] = useQueryState('endDate', parseAsIsoDateTime);
  const [eventNames] = useEventQueryNamesFilter();
  const columnVisibility = useReadColumnVisibility('events');
  const query = useInfiniteQuery(
    trpc.event.events.infiniteQueryOptions(
      {
        projectId,
        profileId,
        filters,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        events: eventNames,
        columnVisibility: columnVisibility ?? {},
      },
      {
        enabled: columnVisibility !== null,
        getNextPageParam: (lastPage) => lastPage.meta.next,
      },
    ),
  );

  return <EventsTable query={query} />;
}
