import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { PlusIcon, TagIcon } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';
import { GroupsTable } from '@/components/groups/table';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { useDataTablePagination } from '@/components/ui/data-table/data-table-hooks';
import { ToolbarSelect } from '@/components/ui/toolbar-select';
import { useSearchQueryState } from '@/hooks/use-search-query-state';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import { createProjectTitle } from '@/utils/title';

const PAGE_SIZE = 50;
const ALL_TYPES = 'all';

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
        cursor: page - 1,
      },
      { placeholderData: keepPreviousData }
    )
  );

  const types = typesQuery.data ?? [];

  return (
    <PageContainer>
      <PageHeader
        actions={
          <Button onClick={() => pushModal('AddGroup')}>
            <PlusIcon className="mr-2 size-4" />
            Add group
          </Button>
        }
        className="mb-8"
        description="Groups represent companies, teams, or other entities that events belong to."
        title="Groups"
      />

      <GroupsTable
        pageSize={PAGE_SIZE}
        query={groupsQuery}
        toolbarLeft={
          types.length > 0 ? (
            <ToolbarSelect
              icon={TagIcon}
              label="Type"
              onChange={(value) =>
                setTypeFilter(value === ALL_TYPES ? '' : value)
              }
              options={[
                { value: ALL_TYPES, label: 'All types' },
                ...types.map((type) => ({ value: type, label: type })),
              ]}
              value={typeFilter || ALL_TYPES}
            />
          ) : null
        }
      />
    </PageContainer>
  );
}
