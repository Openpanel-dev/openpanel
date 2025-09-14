import { TooltipComplete } from '@/components/tooltip-complete';
import { ComboboxAdvanced } from '@/components/ui/combobox-advanced';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useTRPC } from '@/integrations/trpc/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import type { ColumnDef, Row } from '@tanstack/react-table';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

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

function AccessCell({
  row,
}: {
  row: Row<IServiceMember>;
}) {
  const currentUserId = useRouteContext({
    from: '/_app',
    select: (context) => context.session.userId,
  });
  const initial = useRef(
    row.original.access?.map((item) => item.projectId) ?? [],
  );
  const [access, setAccess] = useState<string[]>(initial.current);
  const trpc = useTRPC();
  const projectsQuery = useQuery(
    trpc.project.list.queryOptions({
      organizationId: row.original.organizationId,
    }),
  );
  const projects = projectsQuery.data ?? [];
  const mutation = useMutation(
    trpc.organization.updateMemberAccess.mutationOptions({
      onError(error) {
        toast.error(error.message);
        setAccess(initial.current);
      },
    }),
  );

  if (currentUserId === row.original.userId) {
    return (
      <div className="text-muted-foreground">Can't change your own access</div>
    );
  }

  return (
    <ComboboxAdvanced
      placeholder="Restrict access to projects"
      value={access}
      onChange={(newAccess) => {
        setAccess(newAccess);
        mutation.mutate({
          userId: row.original.user!.id,
          organizationId: row.original.organizationId,
          access: newAccess as string[],
        });
      }}
      items={projects.map((item) => ({
        label: item.name,
        value: item.id,
      }))}
    />
  );
}
