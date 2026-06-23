import { ColumnCreatedAt } from '@/components/column-created-at';
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
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/references',
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

function useColumns(): ColumnDef<IServiceReference>[] {
  const { t } = useTranslation();

  return [
    {
      accessorKey: 'title',
      header: createHeaderColumn(t('references.title')),
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
        placeholder: t('ui.search'),
        label: t('references.title'),
      },
    },
    {
      accessorKey: 'date',
      header: createHeaderColumn(t('references.occurrence')),
      cell({ row }) {
        const date = row.original.date;
        return formatDateTime(date);
      },
      filterFn: 'isWithinRange',
      sortingFn: 'datetime',
      meta: {
        variant: 'dateRange',
        placeholder: t('references.occurrence'),
        label: t('references.occurrence'),
        hidden: true,
      },
    },
    {
      accessorKey: 'createdAt',
      header: createHeaderColumn(t('references.created_at')),
      size: ColumnCreatedAt.size,
      cell: ({ row }) => {
        const item = row.original;
        return <ColumnCreatedAt>{item.createdAt}</ColumnCreatedAt>;
      },
      filterFn: 'isWithinRange',
      sortingFn: 'datetime',
      meta: {
        variant: 'dateRange',
        placeholder: t('references.created_at'),
        label: t('references.created_at'),
      },
    },
    createActionColumn(({ row }) => {
      const trpc = useTRPC();
      const queryClient = useQueryClient();
      const deletion = useMutation(
        trpc.reference.delete.mutationOptions({
          onSuccess() {
            toast.success(t('references.toast_deleted'));
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
            {t('common.edit')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() =>
              showConfirm({
                title: t('references.delete_reference'),
                text: t('references.delete_reference_confirm'),
                onConfirm() {
                  deletion.mutate({
                    id: ref.id,
                  });
                },
              })
            }
          >
            {t('common.delete')}
          </DropdownMenuItem>
        </>
      );
    }),
  ];
}

function Component() {
  const { t } = useTranslation();
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

  const columns = useColumns();

  const { table, loading } = useTable({
    name: 'references',
    columns,
    data,
    pageSize: 30,
    loading: query.isLoading,
  });

  return (
    <PageContainer>
      <PageHeader
        title={t('references.page_title')}
        description={t('references.page_description')}
        className="mb-8"
      />
      <DataTableToolbar table={table}>
        <Button icon={PlusIcon} onClick={() => pushModal('AddReference')}>
          <span className="max-sm:hidden">
            {t('references.create_reference')}
          </span>
          <span className="sm:hidden">{t('references.reference')}</span>
        </Button>
      </DataTableToolbar>
      <DataTable table={table} loading={loading} />
    </PageContainer>
  );
}
