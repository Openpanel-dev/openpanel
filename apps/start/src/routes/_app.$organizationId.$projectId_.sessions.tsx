import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { SessionsTable } from '@/components/sessions/table';
import { useDataTablePagination } from '@/components/ui/data-table/data-table-hooks';
import { useSearchQueryState } from '@/hooks/use-search-query-state';
import { useTRPC } from '@/integrations/trpc/react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId_/sessions',
)({
  component: Component,
});

function Component() {
  const { projectId } = Route.useParams();
  const trpc = useTRPC();

  const { page } = useDataTablePagination(50);
  const { debouncedSearch } = useSearchQueryState();

  const query = useQuery(
    trpc.session.list.queryOptions(
      {
        cursor: (page - 1) * 50,
        projectId,
        take: 50,
        search: debouncedSearch,
      },
      {
        placeholderData: keepPreviousData,
      },
    ),
  );

  return (
    <PageContainer>
      <PageHeader
        title="Sessions"
        description="Access all your sessions here"
        className="mb-8"
      />
      <SessionsTable query={query} />
    </PageContainer>
  );
}
