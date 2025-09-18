import EventListener from '@/components/events/event-listener';
import { EventsTable } from '@/components/events/table';
import { TableButtons } from '@/components/ui/table';
import { useTRPC } from '@/integrations/trpc/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Loader2Icon } from 'lucide-react';
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
  const query = useInfiniteQuery(
    trpc.event.conversions.infiniteQueryOptions(
      {
        projectId,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      },
      {
        getNextPageParam: (lastPage) => lastPage.meta.next,
      },
    ),
  );

  return <EventsTable query={query} />;
}
