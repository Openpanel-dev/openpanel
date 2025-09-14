import { ProfilesTable } from '@/components/profiles/table';
import { Input } from '@/components/ui/input';
import { TableButtons } from '@/components/ui/table';
import { useSearchQueryState } from '@/hooks/use-search-query-state';
import { useTRPC } from '@/integrations/trpc/react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Loader2Icon } from 'lucide-react';
import { parseAsInteger, useQueryState } from 'nuqs';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId_/profiles/_tabs/anonymous',
)({
  component: Component,
});

function Component() {
  const { projectId } = Route.useParams();
  const trpc = useTRPC();
  const [cursor, setCursor] = useQueryState(
    'cursor',
    parseAsInteger.withDefault(0),
  );
  const { debouncedSearch, setSearch, search } = useSearchQueryState();
  const query = useQuery(
    trpc.profile.list.queryOptions(
      {
        cursor,
        projectId,
        take: 50,
        search: debouncedSearch,
        isExternal: false,
      },
      {
        initialData: keepPreviousData,
      },
    ),
  );

  return (
    <>
      <TableButtons>
        <div>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search profiles"
          />
        </div>
        {query.isRefetching && (
          <div className="center-center size-8 rounded border bg-background">
            <Loader2Icon
              size={12}
              className="size-4 shrink-0 animate-spin text-black"
            />
          </div>
        )}
      </TableButtons>
      <ProfilesTable query={query} cursor={cursor} setCursor={setCursor} />
    </>
  );
}
