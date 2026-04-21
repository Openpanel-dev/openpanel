import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ProfilesTable } from '@/components/profiles/table';
import { useDataTablePagination } from '@/components/ui/data-table/data-table-hooks';
import { useSearchQueryState } from '@/hooks/use-search-query-state';
import { useTRPC } from '@/integrations/trpc/react';
import { createProjectTitle, PAGE_TITLES } from '@/utils/title';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/cohorts_/$cohortId/_tabs/members'
)({
  component: Component,
  head: () => ({
    meta: [{ title: createProjectTitle(PAGE_TITLES.COHORT_MEMBERS) }],
  }),
});

function Component() {
  const { projectId, cohortId } = Route.useParams();
  const trpc = useTRPC();
  const { debouncedSearch } = useSearchQueryState();
  const { page } = useDataTablePagination(50);

  const query = useQuery({
    ...trpc.cohort.listProfiles.queryOptions({
      projectId,
      cohortId,
      cursor: page - 1,
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
