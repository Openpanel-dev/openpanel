import { EventsTable } from '@/components/events/table';
import { useEventQueryNamesFilter } from '@/hooks/use-event-query-filters';
import { useTRPC } from '@/integrations/trpc/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { parseAsIsoDateTime, useQueryState } from 'nuqs';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/events/_tabs/conversions',
)({
  component: Component,
});

function Component() {
  const { projectId } = Route.useParams();
  const trpc = useTRPC();
  const [startDate, setStartDate] = useQueryState(
    'startDate',
    parseAsIsoDateTime,
  );
  const [endDate, setEndDate] = useQueryState('endDate', parseAsIsoDateTime);
  const [eventNames] = useEventQueryNamesFilter();
  const query = useInfiniteQuery(
    trpc.event.conversions.infiniteQueryOptions(
      {
        projectId,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        events: eventNames,
      },
      {
        getNextPageParam: (lastPage) => lastPage.meta.next,
      },
    ),
  );

  return <EventsTable query={query} />;
}
