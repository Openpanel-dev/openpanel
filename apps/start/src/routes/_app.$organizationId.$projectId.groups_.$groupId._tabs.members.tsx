import { ProfilesTable } from '@/components/profiles/table';
import { useDataTablePagination } from '@/components/ui/data-table/data-table-hooks';
import { useSearchQueryState } from '@/hooks/use-search-query-state';
import { useTRPC } from '@/integrations/trpc/react';
import { createProjectTitle } from '@/utils/title';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

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
  const { page } = useDataTablePagination(50);

  const query = useQuery({
    ...trpc.group.listProfiles.queryOptions({
      projectId,
      groupId,
      cursor: (page - 1) * 50,
      take: 50,
      search: debouncedSearch || undefined,
    }),
    placeholderData: keepPreviousData,
  });

  return (
    <ProfilesTable
      pageSize={50}
      query={query as Parameters<typeof ProfilesTable>[0]['query']}
      type="profiles"
    />
  );
}
