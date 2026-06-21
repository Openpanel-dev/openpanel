import { DropdownMenuSeparator } from '@radix-ui/react-dropdown-menu';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { ColumnCreatedAt } from '@/components/column-created-at';
import CopyInput from '@/components/forms/copy-input';
import { createActionColumn } from '@/components/ui/data-table/data-table-helpers';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { pushModal, showConfirm } from '@/modals';
import type { RouterOutputs } from '@/trpc/client';
import { clipboard } from '@/utils/clipboard';
import { useTranslation } from 'react-i18next';

export function useColumns() {
  const { t } = useTranslation();
  const columns: ColumnDef<RouterOutputs['client']['list'][number]>[] = [
    {
      accessorKey: 'name',
      header: t('clients.column_name'),
      cell: ({ row }) => {
        return <div className="font-medium">{row.original.name}</div>;
      },
    },
    {
      accessorKey: 'id',
      header: t('clients.field_client_id'),
      cell: ({ row }) => <CopyInput label={null} value={row.original.id} />,
    },
    {
      accessorKey: 'createdAt',
      header: t('clients.column_created_at'),
      size: ColumnCreatedAt.size,
      cell: ({ row }) => {
        const item = row.original;
        return <ColumnCreatedAt>{item.createdAt}</ColumnCreatedAt>;
      },
    },
    createActionColumn(({ row }) => {
      const client = row.original;
      const trpc = useTRPC();
      const queryClient = useQueryClient();
      const deletion = useMutation(
        trpc.client.remove.mutationOptions({
          onSuccess() {
            toast(t('clients.revoke_success_title'), {
              description: t('clients.revoke_success_description'),
            });
            queryClient.invalidateQueries(trpc.client.list.pathFilter());
          },
          onError: handleError,
        })
      );
      return (
        <>
          <DropdownMenuItem onClick={() => clipboard(client.id)}>
            {t('clients.action_copy_client_id')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              pushModal('EditClient', client);
            }}
          >
            {t('clients.action_edit')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              showConfirm({
                title: t('clients.revoke_confirm_title'),
                text: t('clients.revoke_confirm_description'),
                onConfirm() {
                  deletion.mutate({
                    id: client.id,
                  });
                },
              });
            }}
            variant="destructive"
          >
            {t('clients.action_revoke')}
          </DropdownMenuItem>
        </>
      );
    }),
  ];

  return columns;
}
