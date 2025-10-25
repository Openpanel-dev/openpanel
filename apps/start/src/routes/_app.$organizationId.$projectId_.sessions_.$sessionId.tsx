import { EventsTable } from '@/components/events/table';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import { useReadColumnVisibility } from '@/components/ui/data-table/data-table-hooks';
import {
  useEventQueryFilters,
  useEventQueryNamesFilter,
} from '@/hooks/use-event-query-filters';
import { useTRPC } from '@/integrations/trpc/react';
import { createProjectTitle } from '@/utils/title';
import { useInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { parseAsIsoDateTime, useQueryState } from 'nuqs';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId_/sessions_/$sessionId',
)({
  component: Component,
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.prefetchQuery(
        context.trpc.session.byId.queryOptions({
          sessionId: params.sessionId,
          projectId: params.projectId,
        }),
      ),
    ]);
  },
  head: () => {
    return {
      meta: [
        {
          title: createProjectTitle('Sessions'),
        },
      ],
    };
  },
  pendingComponent: FullPageLoadingState,
});

function Component() {
  const { projectId, sessionId } = Route.useParams();
  const trpc = useTRPC();

  const LIMIT = 50;

  const { data: session } = useSuspenseQuery(
    trpc.session.byId.queryOptions({
      sessionId,
      projectId,
    }),
  );

  const [filters] = useEventQueryFilters();
  const [startDate] = useQueryState('startDate', parseAsIsoDateTime);
  const [endDate] = useQueryState('endDate', parseAsIsoDateTime);
  const [eventNames] = useEventQueryNamesFilter();
  const columnVisibility = useReadColumnVisibility('events');
  const query = useInfiniteQuery(
    trpc.event.events.infiniteQueryOptions(
      {
        projectId,
        sessionId,
        filters,
        events: eventNames,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        columnVisibility: columnVisibility ?? {},
      },
      {
        enabled: columnVisibility !== null,
        getNextPageParam: (lastPage) => lastPage.meta.next,
      },
    ),
  );

  return (
    <PageContainer>
      <PageHeader
        title={`Session: ${session.id.slice(0, 4)}...${session.id.slice(-4)}`}
      >
        <div className="row gap-4 mb-6">
          {session.country && (
            <div className="row gap-2 items-center">
              <SerieIcon name={session.country} />
              <span>
                {session.country}
                {session.city && ` / ${session.city}`}
              </span>
            </div>
          )}
          {session.device && (
            <div className="row gap-2 items-center">
              <SerieIcon name={session.device} />
              <span className="capitalize">{session.device}</span>
            </div>
          )}
          {session.os && (
            <div className="row gap-2 items-center">
              <SerieIcon name={session.os} />
              <span>{session.os}</span>
            </div>
          )}
          {session.model && (
            <div className="row gap-2 items-center">
              <SerieIcon name={session.model} />
              <span>{session.model}</span>
            </div>
          )}
          {session.browser && (
            <div className="row gap-2 items-center">
              <SerieIcon name={session.browser} />
              <span>{session.browser}</span>
            </div>
          )}
        </div>
      </PageHeader>
      <EventsTable query={query} />
    </PageContainer>
  );
}
