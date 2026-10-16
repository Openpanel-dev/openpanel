import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ProfilesTable } from '@/components/profiles/table';
import { useDataTablePagination } from '@/components/ui/data-table/data-table-hooks';
import { useSearchQueryState } from '@/hooks/use-search-query-state';
import { useTRPC } from '@/integrations/trpc/react';
import { createProjectTitle } from '@/utils/title';

const PAGE_SIZE = 50;

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/groups_/$groupId/_tabs/members'
)({
  component: Component,
  head: () => ({
    meta: [{ title: createProjectTitle('Group members') }],
  }),
});

function Component() {
  const { projectId, groupId } = Route.useParams();
  const trpc = useTRPC();
  const { debouncedSearch } = useSearchQueryState();
  const { page } = useDataTablePagination(PAGE_SIZE);

  const query = useQuery({
    ...trpc.group.listProfiles.queryOptions({
      projectId,
      groupId,
      cursor: page - 1,
      take: PAGE_SIZE,
      search: debouncedSearch || undefined,
    }),
    placeholderData: keepPreviousData,
  });

  return (
    <ProfilesTable
      pageSize={PAGE_SIZE}
      query={query as Parameters<typeof ProfilesTable>[0]['query']}
      type="profiles"
    />
  );
}
