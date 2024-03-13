import { formatDate } from '@/utils/date';
import type { ColumnDef } from '@tanstack/react-table';

import { IServiceProject } from '@openpanel/db';
import type { Project as IProject } from '@openpanel/db';

import { ProjectActions } from './ProjectActions';

export type Project = IProject;
export const columns: ColumnDef<Project>[] = [
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
