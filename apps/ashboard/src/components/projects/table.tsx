import { formatDate } from '@/utils/date';
import type { ColumnDef } from '@tanstack/react-table';

import type { IServiceProject } from '@openpanel/db';

import { ProjectActions } from './project-actions';

export type Project = IServiceProject;
export const columns: ColumnDef<IServiceProject>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
  },
  {
    accessorKey: 'createdAt',
    header: 'Created at',
    cell({ row }) {
      const date = row.original.createdAt;
      return <div>{formatDate(date)}</div>;
    },
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => <ProjectActions {...row.original} />,
  },
];
