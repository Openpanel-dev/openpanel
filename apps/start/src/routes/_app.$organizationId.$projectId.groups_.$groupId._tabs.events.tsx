import { EventsTable } from '@/components/events/table';
import { useReadColumnVisibility } from '@/components/ui/data-table/data-table-hooks';
import { useEventQueryNamesFilter } from '@/hooks/use-event-query-filters';
import { useTRPC } from '@/integrations/trpc/react';
import { createProjectTitle } from '@/utils/title';
import { useInfiniteQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { parseAsIsoDateTime, useQueryState } from 'nuqs';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/groups_/$groupId/_tabs/events'
)({
  component: Component,
  head: () => ({
    meta: [{ title: createProjectTitle('Group events') }],
  }),
});

function Component() {
  const { projectId, groupId } = Route.useParams();
  const trpc = useTRPC();
  const [startDate] = useQueryState('startDate', parseAsIsoDateTime);
  const [endDate] = useQueryState('endDate', parseAsIsoDateTime);
  const [eventNames] = useEventQueryNamesFilter();
  const columnVisibility = useReadColumnVisibility('events');

  const query = useInfiniteQuery(
    trpc.event.events.infiniteQueryOptions(
      {
        projectId,
        groupId,
        filters: [], // Always scope to group only; date + event names from toolbar still apply
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        events: eventNames,
        columnVisibility: columnVisibility ?? {},
      },
      {
        enabled: columnVisibility !== null,
        getNextPageParam: (lastPage) => lastPage.meta.next,
      }
    )
  );

  return <EventsTable query={query} />;
}
