import { formatDate } from '@/utils/date';
import type { ColumnDef } from '@tanstack/react-table';

import type { IServiceClientWithProject } from '@mixan/db';

import { ClientActions } from './ClientActions';

export const columns: ColumnDef<IServiceClientWithProject>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => {
      return (
        <div>
          <div>{row.original.name}</div>
          <div className="text-sm text-muted-foreground">
            {row.original.project.name}
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: 'id',
    header: 'Client ID',
  },
  {
    accessorKey: 'cors',
    header: 'Cors',
  },
  {
    accessorKey: 'secret',
    header: 'Secret',
    cell: (info) =>
      info.getValue() ? (
        <div className="italic text-muted-foreground">Hidden</div>
      ) : (
        'None'
      ),
  },
  {
    accessorKey: 'createdAt',
    header: 'Created at',
    cell({ row }) {
      const date = row.original.createdAt;
      return formatDate(date);
    },
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => <ClientActions {...row.original} />,
  },
];
