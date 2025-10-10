import { ProfilesTable } from '@/components/profiles/table';
import { useDataTablePagination } from '@/components/ui/data-table/data-table-hooks';
import { useTRPC } from '@/integrations/trpc/react';
import { PAGE_TITLES, createEntityTitle } from '@/utils/title';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId_/profiles/_tabs/power-users',
)({
  component: Component,
  head: () => {
    return {
      meta: [
        {
          title: createEntityTitle('Power Users', PAGE_TITLES.PROFILES),
        },
      ],
    };
  },
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
