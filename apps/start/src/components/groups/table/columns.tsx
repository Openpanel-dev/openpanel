import { useAppParams } from '@/hooks/use-app-params';
import { ColumnCreatedAt } from '@/components/column-created-at';
import { Badge } from '@/components/ui/badge';
import { Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import type { IServiceGroup } from '@openpanel/db';

export type IServiceGroupWithStats = IServiceGroup & {
  memberCount: number;
  lastActiveAt: Date | null;
};

export function useGroupColumns(): ColumnDef<IServiceGroupWithStats>[] {
  const { organizationId, projectId } = useAppParams();

  return [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => {
        const group = row.original;
        return (
          <Link
            className="font-medium hover:underline"
            params={{ organizationId, projectId, groupId: group.id }}
            to="/$organizationId/$projectId/groups/$groupId"
          >
            {group.name}
          </Link>
        );
      },
    },
    {
      accessorKey: 'id',
      header: 'ID',
      cell: ({ row }) => (
        <span className="font-mono text-muted-foreground text-xs">
          {row.original.id}
        </span>
      ),
    },
    {
      accessorKey: 'type',
      header: 'Type',
      cell: ({ row }) => (
        <Badge variant="outline">{row.original.type}</Badge>
      ),
    },
    {
      accessorKey: 'memberCount',
      header: 'Members',
      cell: ({ row }) => (
        <span className="tabular-nums">{row.original.memberCount}</span>
      ),
    },
    {
      accessorKey: 'lastActiveAt',
      header: 'Last active',
      size: ColumnCreatedAt.size,
      cell: ({ row }) =>
        row.original.lastActiveAt ? (
          <ColumnCreatedAt>{row.original.lastActiveAt}</ColumnCreatedAt>
        ) : (
          <span className="text-muted-foreground">—</span>
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
  ];
}
