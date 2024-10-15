import { formatDate } from '@/utils/date';
import type { ColumnDef } from '@tanstack/react-table';

import type { IServiceProject } from '@openpanel/db';

import { ACTIONS } from '../data-table';
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
    id: ACTIONS,
    header: 'Actions',
    cell: ({ row }) => <ProjectActions {...row.original} />,
  },
];
