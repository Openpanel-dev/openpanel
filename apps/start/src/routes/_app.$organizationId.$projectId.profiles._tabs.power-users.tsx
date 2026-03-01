import { ProfilesTable } from '@/components/profiles/table';
import { useDataTablePagination } from '@/components/ui/data-table/data-table-hooks';
import { useTRPC } from '@/integrations/trpc/react';
import { PAGE_TITLES, createEntityTitle } from '@/utils/title';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/profiles/_tabs/power-users',
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
  const { page } = useDataTablePagination(50);
  const query = useQuery(
    trpc.profile.powerUsers.queryOptions(
      {
        cursor: page - 1,
        projectId,
        take: 50,
      },
      {
        placeholderData: keepPreviousData,
      },
    ),
  );

  return <ProfilesTable query={query} type="power-users" />;
}
