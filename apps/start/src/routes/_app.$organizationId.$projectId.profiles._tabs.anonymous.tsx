import { ProfilesTable } from '@/components/profiles/table';
import { useDataTablePagination } from '@/components/ui/data-table/data-table-hooks';
import { useSearchQueryState } from '@/hooks/use-search-query-state';
import { useTRPC } from '@/integrations/trpc/react';
import { PAGE_TITLES, createEntityTitle } from '@/utils/title';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/profiles/_tabs/anonymous',
)({
  component: Component,
  head: () => {
    return {
      meta: [
        {
          title: createEntityTitle('Anonymous', PAGE_TITLES.PROFILES),
        },
      ],
    };
  },
});

function Component() {
  const { projectId } = Route.useParams();
  const trpc = useTRPC();
  const { page } = useDataTablePagination(50);
  const { debouncedSearch } = useSearchQueryState();
  const query = useQuery(
    trpc.profile.list.queryOptions(
      {
        cursor: page - 1,
        projectId,
        take: 50,
        search: debouncedSearch,
        isExternal: false,
      },
      {
        placeholderData: keepPreviousData,
      },
    ),
  );

  return <ProfilesTable query={query} type="profiles" />;
}
