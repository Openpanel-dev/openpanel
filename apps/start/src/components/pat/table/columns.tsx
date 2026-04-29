import { DropdownMenuSeparator } from '@radix-ui/react-dropdown-menu';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { ColumnCreatedAt } from '@/components/column-created-at';
import { createActionColumn } from '@/components/ui/data-table/data-table-helpers';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { showConfirm } from '@/modals';
import type { RouterOutputs } from '@/trpc/client';

type PAT = RouterOutputs['pat']['list'][number];

export function useColumns(organizationId: string) {
  const columns: ColumnDef<PAT>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <div className="font-medium">{row.original.name}</div>
      ),
    },
    {
      accessorKey: 'lastUsedAt',
      header: 'Last used',
      cell: ({ row }) =>
        row.original.lastUsedAt ? (
          <ColumnCreatedAt>{row.original.lastUsedAt}</ColumnCreatedAt>
        ) : (
          <span className="text-muted-foreground">Never</span>
        ),
    },
    {
      accessorKey: 'expiresAt',
      header: 'Expires',
      cell: ({ row }) =>
        row.original.expiresAt ? (
          <ColumnCreatedAt>{row.original.expiresAt}</ColumnCreatedAt>
        ) : (
          <span className="text-muted-foreground">Never</span>
        ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      size: ColumnCreatedAt.size,
      cell: ({ row }) => (
        <ColumnCreatedAt>{row.original.createdAt}</ColumnCreatedAt>
      ),
    },
    createActionColumn(({ row }) => {
      const pat = row.original;
      const trpc = useTRPC();
      const queryClient = useQueryClient();
      const deletion = useMutation(
        trpc.pat.delete.mutationOptions({
          onSuccess() {
            toast('Token revoked', {
              description: 'The personal access token has been revoked.',
            });
            queryClient.invalidateQueries(
              trpc.pat.list.queryFilter({ organizationId }),
            );
          },
          onError: handleError,
        }),
      );
      return (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              showConfirm({
                title: 'Revoke token',
                text: `Revoking "${pat.name}" will immediately invalidate it. Any scripts using this token will stop working.`,
                onConfirm() {
                  deletion.mutate({ id: pat.id });
                },
              });
            }}
            variant="destructive"
          >
            Revoke
          </DropdownMenuItem>
        </>
      );
    }),
  ];

  return columns;
}
