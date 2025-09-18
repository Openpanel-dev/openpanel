import { ProfilesTable } from '@/components/profiles/table';
import { useDataTablePagination } from '@/components/ui/data-table/data-table-hooks';
import { TableButtons } from '@/components/ui/table';
import { useSearchQueryState } from '@/hooks/use-search-query-state';
import { useTRPC } from '@/integrations/trpc/react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Loader2Icon } from 'lucide-react';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId_/profiles/_tabs/power-users',
)({
  component: Component,
});

function Component() {
  const { projectId } = Route.useParams();
  const trpc = useTRPC();
  const { page } = useDataTablePagination();
  const query = useQuery(
    trpc.profile.powerUsers.queryOptions(
      {
        cursor: (page - 1) * 50,
        projectId,
        take: 50,
      },
      {
        initialData: keepPreviousData,
      },
    ),
  );

  return <ProfilesTable query={query} type="power-users" />;
}
