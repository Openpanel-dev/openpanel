import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { PlusIcon } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';
import { GroupsTable } from '@/components/groups/table';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { useDataTablePagination } from '@/components/ui/data-table/data-table-hooks';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSearchQueryState } from '@/hooks/use-search-query-state';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import { createProjectTitle } from '@/utils/title';

const PAGE_SIZE = 50;

export const Route = createFileRoute('/_app/$organizationId/$projectId/groups')(
  {
    component: Component,
    head: () => ({
      meta: [{ title: createProjectTitle('Groups') }],
    }),
  }
);

function Component() {
  const { projectId } = Route.useParams();
  const trpc = useTRPC();
  const { debouncedSearch } = useSearchQueryState();
  const [typeFilter, setTypeFilter] = useQueryState(
    'type',
    parseAsString.withDefault('')
  );
  const { page } = useDataTablePagination(PAGE_SIZE);

  const typesQuery = useQuery(trpc.group.types.queryOptions({ projectId }));

  const groupsQuery = useQuery(
    trpc.group.list.queryOptions(
      {
        projectId,
        search: debouncedSearch || undefined,
        type: typeFilter || undefined,
        take: PAGE_SIZE,
        cursor: (page - 1) * PAGE_SIZE,
      },
      { placeholderData: keepPreviousData }
    )
  );

  const types = typesQuery.data ?? [];

  return (
    <PageContainer>
      {/* "Add group" button intentionally removed — in a real Pin Drop
       * self-hosted setup groups flow in from Stripe / RevenueCat
       * webhooks rather than being hand-created in this UI. Kept the
       * modal + API so integrations can still upsert via the SDK. */}
      <PageHeader
        className="mb-8"
        description="Groups represent companies or paying teams. They're created automatically when your billing system (Stripe, RevenueCat) posts to the OpenPanel API."
        title="Groups"
      />

      <GroupsTable
        pageSize={PAGE_SIZE}
        query={groupsQuery}
        toolbarLeft={
          types.length > 0 ? (
            <Select
              onValueChange={(v) => setTypeFilter(v === 'all' ? '' : v)}
              value={typeFilter || 'all'}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {types.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null
        }
      />
    </PageContainer>
  );
}
