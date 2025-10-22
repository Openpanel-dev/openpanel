import { EventsTable } from '@/components/events/table';
import { useReadColumnVisibility } from '@/components/ui/data-table/data-table-hooks';
import { useTRPC } from '@/integrations/trpc/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { parseAsIsoDateTime, useQueryState } from 'nuqs';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId_/events/_tabs/conversions',
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
  const columnVisibility = useReadColumnVisibility('events');
  const query = useInfiniteQuery(
    trpc.event.conversions.infiniteQueryOptions(
      {
        projectId,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        columnVisibility: columnVisibility ?? {},
      },
      {
        getNextPageParam: (lastPage) => lastPage.meta.next,
      },
    ),
  );

  return <EventsTable query={query} />;
}
