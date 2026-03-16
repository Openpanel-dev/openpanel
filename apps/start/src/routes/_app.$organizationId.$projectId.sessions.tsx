import { useInfiniteQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { SessionsTable } from '@/components/sessions/table';
import { useSearchQueryState } from '@/hooks/use-search-query-state';
import { useSessionFilters } from '@/hooks/use-session-filters';
import { useTRPC } from '@/integrations/trpc/react';
import { createProjectTitle, PAGE_TITLES } from '@/utils/title';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/sessions'
)({
  component: Component,
  head: () => {
    return {
      meta: [
        {
          title: createProjectTitle(PAGE_TITLES.SESSIONS),
        },
      ],
    };
  },
});

function Component() {
  const { projectId } = Route.useParams();
  const trpc = useTRPC();
  const { debouncedSearch } = useSearchQueryState();
  const { filters, minPageViews, maxPageViews, minEvents, maxEvents } =
    useSessionFilters();

  const query = useInfiniteQuery(
    trpc.session.list.infiniteQueryOptions(
      {
        projectId,
        take: 50,
        search: debouncedSearch,
        filters,
        minPageViews,
        maxPageViews,
        minEvents,
        maxEvents,
      },
      {
        getNextPageParam: (lastPage) => lastPage.meta.next,
      }
    )
  );

  return (
    <PageContainer>
      <PageHeader
        className="mb-8"
        description="Access all your sessions here"
        title="Sessions"
      />
      <SessionsTable query={query} />
    </PageContainer>
  );
}
