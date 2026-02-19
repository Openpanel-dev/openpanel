import { SessionsTable } from '@/components/sessions/table';
import { useSearchQueryState } from '@/hooks/use-search-query-state';
import { useTRPC } from '@/integrations/trpc/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/profiles/$profileId/_tabs/sessions',
)({
  component: Component,
});

function Component() {
  const { projectId, profileId } = Route.useParams();
  const trpc = useTRPC();
  const { debouncedSearch } = useSearchQueryState();

  const query = useInfiniteQuery(
    trpc.session.list.infiniteQueryOptions(
      {
        projectId,
        profileId,
        take: 50,
        search: debouncedSearch,
      },
      {
        getNextPageParam: (lastPage) => lastPage.meta.next,
      },
    ),
  );

  return <SessionsTable query={query} />;
}
