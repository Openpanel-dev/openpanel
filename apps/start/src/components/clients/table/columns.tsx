import { formatDateTime, formatTime } from '@/utils/date';
import type { ColumnDef } from '@tanstack/react-table';
import { isToday } from 'date-fns';

import CopyInput from '@/components/forms/copy-input';
import { createActionColumn } from '@/components/ui/data-table/data-table-helpers';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { pushModal, showConfirm } from '@/modals';
import type { RouterOutputs } from '@/trpc/client';
import { clipboard } from '@/utils/clipboard';
import { DropdownMenuSeparator } from '@radix-ui/react-dropdown-menu';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export function useColumns() {
  const columns: ColumnDef<RouterOutputs['client']['list'][number]>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => {
        return <div className="font-medium">{row.original.name}</div>;
      },
    },
    {
      accessorKey: 'id',
      header: 'Client ID',
      cell: ({ row }) => <CopyInput label={null} value={row.original.id} />,
    },
    {
      accessorKey: 'createdAt',
      header: 'Created at',
      cell({ row }) {
        const date = row.original.createdAt;
        return (
          <div>{isToday(date) ? formatTime(date) : formatDateTime(date)}</div>
        );
      },
    },
    createActionColumn(({ row }) => {
      const client = row.original;
      const trpc = useTRPC();
      const queryClient = useQueryClient();
      const deletion = useMutation(
        trpc.client.remove.mutationOptions({
          onSuccess() {
            toast('Success', {
              description:
                'Client revoked, incoming requests will be rejected.',
            });
            queryClient.invalidateQueries(trpc.client.list.pathFilter());
          },
          onError: handleError,
        }),
      );
      return (
        <>
          <DropdownMenuItem onClick={() => clipboard(client.id)}>
            Copy client ID
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              pushModal('EditClient', client);
            }}
          >
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              showConfirm({
                title: 'Revoke client',
                text: 'Are you sure you want to revoke this client? This action cannot be undone.',
                onConfirm() {
                  deletion.mutate({
                    id: client.id,
                  });
                },
              });
            }}
          >
            Revoke
          </DropdownMenuItem>
        </>
      );
    }),
  ];

  return columns;
}
