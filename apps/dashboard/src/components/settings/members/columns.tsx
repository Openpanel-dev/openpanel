import { TooltipComplete } from '@/components/tooltip-complete';
import { Button } from '@/components/ui/button';
import { ComboboxAdvanced } from '@/components/ui/combobox-advanced';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api } from '@/trpc/client';
import type { ColumnDef, Row } from '@tanstack/react-table';
import { MoreHorizontalIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import type { IServiceMember, IServiceProject } from '@openpanel/db';

export function useColumns(projects: IServiceProject[]) {
  const columns: ColumnDef<IServiceMember>[] = [
    {
      accessorKey: 'user',
      header: 'Name',
      cell: ({ row }) => {
        const user = row.original.user;
        if (!user) return null;
        return [user.firstName, user.lastName].filter(Boolean).join(' ');
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
    },
    {
      accessorKey: 'role',
      header: 'Role',
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
    },
    {
      accessorKey: 'access',
      header: 'Access',
      cell: ({ row }) => {
        return <AccessCell row={row} projects={projects} />;
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        return <ActionsCell row={row} />;
      },
    },
  ];

  return columns;
}

function AccessCell({
  row,
  projects,
}: {
  row: Row<IServiceMember>;
  projects: IServiceProject[];
}) {
  const [access, setAccess] = useState<string[]>(
    row.original.access.map((item) => item.projectId),
  );
  const mutation = api.organization.updateMemberAccess.useMutation();

  return (
    <ComboboxAdvanced
      placeholder="Restrict access to projects"
      value={access}
      onChange={(newAccess) => {
        setAccess(newAccess);
        mutation.mutate({
          userId: row.original.user!.id,
          organizationSlug: row.original.organizationId,
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

function ActionsCell({ row }: { row: Row<IServiceMember> }) {
  const router = useRouter();
  const revoke = api.organization.removeMember.useMutation({
    onSuccess() {
      toast.success(
        `${row.original.user?.firstName} has been removed from the organization`,
      );
      router.refresh();
    },
    onError() {
      toast.error(
        `Failed to remove ${row.original.user?.firstName} from the organization`,
      );
    },
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button icon={MoreHorizontalIcon} size="icon" variant={'outline'} />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          className="text-destructive"
          onClick={() => {
            revoke.mutate({
              organizationId: row.original.organizationId,
              userId: row.original.id,
            });
          }}
        >
          Remove member
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
