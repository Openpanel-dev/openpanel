import { TooltipComplete } from '@/components/tooltip-complete';
import { Badge } from '@/components/ui/badge';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useTRPC } from '@/integrations/trpc/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef, Row } from '@tanstack/react-table';
import { toast } from 'sonner';

import { createActionColumn } from '@/components/ui/data-table/data-table-helpers';
import type { RouterOutputs } from '@/trpc/client';
import { clipboard } from '@/utils/clipboard';

export function useColumns(): ColumnDef<
  RouterOutputs['organization']['invitations'][number]
>[] {
  return [
    {
      accessorKey: 'id',
    },
    {
      accessorKey: 'email',
      header: 'Mail',
      cell: ({ row }) => (
        <div className="font-medium">{row.original.email}</div>
      ),
      meta: {
        label: 'Email',
        placeholder: 'Search email',
        variant: 'text',
      },
    },
    {
      accessorKey: 'role',
      header: 'Role',
      meta: {
        label: 'Role',
      },
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ row }) => (
        <TooltipComplete
          content={new Date(row.original.createdAt).toLocaleString()}
        >
          {new Date(row.original.createdAt).toLocaleDateString()}
        </TooltipComplete>
      ),
      meta: {
        label: 'Created',
      },
    },
    {
      accessorKey: 'projectAccess',
      header: 'Access',
      cell: ({ row }) => {
        return <AccessCell row={row} />;
      },
      meta: {
        label: 'Access',
      },
    },
    createActionColumn(({ row }) => {
      const trpc = useTRPC();
      const queryClient = useQueryClient();
      const revoke = useMutation(
        trpc.organization.revokeInvite.mutationOptions({
          onSuccess() {
            toast.success(`Invite for ${row.original.email} revoked`);
            queryClient.invalidateQueries(
              trpc.organization.invitations.queryFilter({
                organizationId: row.original.organizationId,
              }),
            );
          },
          onError() {
            toast.error(`Failed to revoke invite for ${row.original.email}`);
          },
        }),
      );

      return (
        <>
          <DropdownMenuItem
            onClick={() => {
              clipboard(
                `${window.location.origin}/onboarding?inviteId=${row.original.id}`,
              );
            }}
          >
            Copy invite link
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => {
              revoke.mutate({ inviteId: row.original.id });
            }}
          >
            Revoke invite
          </DropdownMenuItem>
        </>
      );
    }),
  ];
}

function AccessCell({
  row,
}: {
  row: Row<RouterOutputs['organization']['invitations'][number]>;
}) {
  const trpc = useTRPC();
  const projectsQuery = useQuery(
    trpc.project.list.queryOptions({
      organizationId: row.original.organizationId,
    }),
  );
  const projects = projectsQuery.data ?? [];
  const access = row.original.projectAccess ?? [];

  return (
    <>
      {access.map((id) => {
        const project = projects.find((p) => p.id === id);
        if (!project) {
          return (
            <Badge key={id} className="mr-1">
              Unknown
            </Badge>
          );
        }
        return (
          <Badge key={id} color="blue" className="mr-1">
            {project.name}
          </Badge>
        );
      })}
      {access.length === 0 && <Badge variant={'secondary'}>All projects</Badge>}
    </>
  );
}
