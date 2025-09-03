import { TableButtons } from '@/components/data-table';
import { ProfilesTable } from '@/components/profiles/table';
import { Input } from '@/components/ui/input';
import { useTRPC } from '@/integrations/trpc/react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Loader2Icon } from 'lucide-react';
import { parseAsInteger, useQueryState } from 'nuqs';
import { useDebounceValue } from 'usehooks-ts';

export const Route = createFileRoute(
  '/_app/$organizationId_/$projectId_/profiles/_tabs/power-users',
)({
  component: Component,
  loader: async ({ context, params }) => {
    await context.queryClient.prefetchQuery(
      context.trpc.dashboard.list.queryOptions({
        projectId: params.projectId,
      }),
    );
  },
});

function Component() {
  const { projectId } = Route.useParams();
  const trpc = useTRPC();
  const query = useQuery(
    trpc.profile.powerUsers.queryOptions(
      {
        projectId,
        take: 50,
      },
      {
        initialData: keepPreviousData,
      },
    ),
  );

  return (
    <>
      <TableButtons>
        {query.isRefetching && (
          <div className="center-center size-8 rounded border bg-background">
            <Loader2Icon
              size={12}
              className="size-4 shrink-0 animate-spin text-black"
            />
          </div>
        )}
      </TableButtons>
      <ProfilesTable query={query} />
    </>
  );
}
