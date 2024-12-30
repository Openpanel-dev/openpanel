import { TooltipComplete } from '@/components/tooltip-complete';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { pathOr } from 'ramda';
import { toast } from 'sonner';

import { ACTIONS } from '@/components/data-table';
import { clipboard } from '@/utils/clipboard';
import type { IServiceInvite, IServiceProject } from '@openpanel/db';

export function useColumns(
  projects: IServiceProject[],
): ColumnDef<IServiceInvite>[] {
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
      accessorKey: 'projectAccess',
      header: 'Access',
      cell: ({ row }) => {
        const access = row.original.projectAccess;
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
            {access.length === 0 && (
              <Badge variant={'secondary'}>All projects</Badge>
            )}
          </>
        );
      },
    },
    {
      id: ACTIONS,
      cell: ({ row }) => {
        return <ActionCell row={row} />;
      },
    },
  ];
}

function ActionCell({ row }: { row: Row<IServiceInvite> }) {
  const router = useRouter();
  const revoke = api.organization.revokeInvite.useMutation({
    onSuccess() {
      toast.success(`Invite for ${row.original.email} revoked`);
      router.refresh();
    },
    onError() {
      toast.error(`Failed to revoke invite for ${row.original.email}`);
    },
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button icon={MoreHorizontalIcon} size="icon" variant={'outline'} />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
