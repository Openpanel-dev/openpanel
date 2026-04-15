import { ProfilesTable } from '@/components/profiles/table';
import {
  useDataTablePagination,
  useDataTableSort,
} from '@/components/ui/data-table/data-table-hooks';
import { useSearchQueryState } from '@/hooks/use-search-query-state';
import { useTRPC } from '@/integrations/trpc/react';
import { PAGE_TITLES, createEntityTitle } from '@/utils/title';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/profiles/_tabs/identified',
)({
  head: () => {
    return {
      meta: [
        {
          title: createEntityTitle('Identified', PAGE_TITLES.PROFILES),
        },
      ],
    };
  },
  component: Component,
});

function Component() {
  const { projectId } = Route.useParams();
  const trpc = useTRPC();

  const { page } = useDataTablePagination(50);
  const { debouncedSearch } = useSearchQueryState();
  const { sortBy, sortDirection } = useDataTableSort('createdAt', 'desc');

  const query = useQuery(
    trpc.profile.list.queryOptions(
      {
        cursor: page - 1,
        projectId,
        take: 50,
        search: debouncedSearch,
        isExternal: true,
        sortBy: (sortBy ?? undefined) as any,
        sortDirection,
      },
      {
        placeholderData: keepPreviousData,
      },
    ),
  );

  return <ProfilesTable type="profiles" query={query} />;
}
