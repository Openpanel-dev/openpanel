import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table/data-table';
import {
  createActionColumn,
  createHeaderColumn,
} from '@/components/ui/data-table/data-table-helpers';
import { DataTableToolbar } from '@/components/ui/data-table/data-table-toolbar';
import { useTable } from '@/components/ui/data-table/use-table';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
// import { Input } from '@/components/ui/input';
// import { TableButtons } from '@/components/ui/table';
// import { useSearchQueryState } from '@/hooks/use-search-query-state';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal, showConfirm } from '@/modals';
import { formatDate, formatDateTime } from '@/utils/date';
import { PAGE_TITLES, createProjectTitle } from '@/utils/title';
import type { IServiceReference } from '@openpanel/db';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { PlusIcon } from 'lucide-react';
import { toast } from 'sonner';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId_/references',
)({
  component: Component,
  head: () => {
    return {
      meta: [
        {
          title: createProjectTitle(PAGE_TITLES.REFERENCES),
        },
      ],
    };
  },
});

export const columnDefs: ColumnDef<IServiceReference>[] = [
  {
    accessorKey: 'title',
    header: createHeaderColumn('Title'),
    cell: ({ row }) => {
      return (
        <div>
          <div className="font-medium">{row.original.title}</div>
          {!!row.original.description && (
            <div className="text-muted-foreground break-words whitespace-normal">
              {row.original.description}
            </div>
          )}
        </div>
      );
    },
    meta: {
      variant: 'text',
      placeholder: 'Search',
      label: 'Title',
    },
  },
  {
    accessorKey: 'date',
    header: createHeaderColumn('Occurrence'),
    cell({ row }) {
      const date = row.original.date;
      return formatDateTime(date);
    },
    filterFn: 'isWithinRange',
    sortingFn: 'datetime',
    meta: {
      variant: 'dateRange',
      placeholder: 'Occurrence',
      label: 'Occurrence',
      hidden: true,
    },
  },
  {
    accessorKey: 'createdAt',
    header: createHeaderColumn('Created at'),
    cell({ row }) {
      const date = row.original.createdAt;
      return formatDate(date);
    },
    filterFn: 'isWithinRange',
    sortingFn: 'datetime',
    meta: {
      variant: 'dateRange',
      placeholder: 'Created at',
      label: 'Created at',
    },
  },
  createActionColumn(({ row }) => {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const deletion = useMutation(
      trpc.reference.delete.mutationOptions({
        onSuccess() {
          toast.success('Reference deleted');
          queryClient.invalidateQueries(trpc.reference.pathFilter());
        },
      }),
    );
    const ref = row.original;
    return (
      <>
        <DropdownMenuItem
          onClick={() =>
            pushModal('EditReference', {
              id: ref.id,
              title: ref.title,
              description: ref.description,
              date: ref.date,
            })
          }
        >
          Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() =>
            showConfirm({
              title: 'Delete reference',
              text: 'Are you sure you want to delete this reference? This action cannot be undone.',
              onConfirm() {
                deletion.mutate({
                  id: ref.id,
                });
              },
            })
          }
        >
          Delete
        </DropdownMenuItem>
      </>
    );
  }),
];

function Component() {
  const { projectId } = Route.useParams();
  const trpc = useTRPC();
  const query = useQuery(
    trpc.reference.getReferences.queryOptions(
      {
        projectId,
      },
      {
        placeholderData: keepPreviousData,
      },
    ),
  );
  const data = query.data ?? [];

  const { table, loading } = useTable({
    name: 'references',
    columns: columnDefs,
    data,
    pageSize: 30,
    loading: query.isLoading,
  });

  return (
    <PageContainer>
      <PageHeader
        title="References"
        description="References is a good way to keep track of important events. They will show up in your reports."
        className="mb-8"
      />
      <DataTableToolbar table={table}>
        <Button icon={PlusIcon} onClick={() => pushModal('AddReference')}>
          <span className="max-sm:hidden">Create reference</span>
          <span className="sm:hidden">Reference</span>
        </Button>
      </DataTableToolbar>
      <DataTable table={table} loading={loading} />
    </PageContainer>
  );
}
