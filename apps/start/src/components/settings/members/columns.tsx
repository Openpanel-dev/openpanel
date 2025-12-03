import { TooltipComplete } from '@/components/tooltip-complete';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useTRPC } from '@/integrations/trpc/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';

import { ColumnCreatedAt } from '@/components/column-created-at';
import { Badge } from '@/components/ui/badge';
import { createActionColumn } from '@/components/ui/data-table/data-table-helpers';
import { pushModal } from '@/modals';
import type { IServiceMember } from '@openpanel/db';

export function useColumns() {
  const columns: ColumnDef<IServiceMember>[] = [
    {
      accessorKey: 'user',
      header: 'Name',
      cell: ({ row }) => {
        const user = row.original.user;
        if (!user) return null;
        return [user.firstName, user.lastName].filter(Boolean).join(' ');
      },
      meta: {
        label: 'Name',
      },
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => {
        const user = row.original.user;
        if (!user) return null;
        return <div className="font-medium">{user.email}</div>;
      },
      meta: {
        label: 'Email',
        placeholder: 'Search email',
        variant: 'text',
      },
    },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ row }) => {
        const role = row.original.role;
        return <Badge variant={'outline'}>{role}</Badge>;
      },
      meta: {
        label: 'Role',
      },
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      size: ColumnCreatedAt.size,
      cell: ({ row }) => {
        const item = row.original;
        return <ColumnCreatedAt>{item.createdAt}</ColumnCreatedAt>;
      },
      meta: {
        label: 'Created',
      },
    },
    {
      accessorKey: 'access',
      header: 'Access',
      cell: ({ row }) => {
        const access = row.original.access ?? [];
        if (access.length === 0) {
          return <div className="text-muted-foreground">All projects</div>;
        }
        return (
          <div className="row flex-wrap gap-2">
            {row.original.access?.map((item) => (
              <Badge variant={'outline'} key={item.projectId}>
                {item.projectId}
              </Badge>
            ))}
          </div>
        );
      },
      meta: {
        label: 'Access',
      },
    },
    createActionColumn(({ row }) => {
      const queryClient = useQueryClient();
      const trpc = useTRPC();
      const revoke = useMutation(
        trpc.organization.removeMember.mutationOptions({
          onSuccess() {
            toast.success(
              `${row.original.user?.firstName} has been removed from the organization`,
            );
            queryClient.invalidateQueries(
              trpc.organization.members.pathFilter(),
            );
          },
          onError() {
            toast.error(
              `Failed to remove ${row.original.user?.firstName} from the organization`,
            );
          },
        }),
      );

      return (
        <>
          <DropdownMenuItem
            onClick={() => {
              pushModal('EditMember', row.original);
            }}
          >
            Edit access
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => {
              revoke.mutate({
                organizationId: row.original.organizationId,
                userId: row.original.userId!,
                id: row.original.id,
              });
            }}
          >
            Remove member
          </DropdownMenuItem>
        </>
      );
    }),
  ];

  return columns;
}
