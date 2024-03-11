import { formatDate, formatDateTime } from '@/utils/date';
import type { IServiceReference } from '@openpanel/db';
import type { ColumnDef } from '@tanstack/react-table';

export const columns: ColumnDef<IServiceReference>[] = [
  {
    accessorKey: 'title',
    header: 'Title',
  },
  {
    accessorKey: 'date',
    header: 'Date',
    cell({ row }) {
      const date = row.original.date;
      return <div>{formatDateTime(date)}</div>;
    },
  },
  {
    accessorKey: 'createdAt',
    header: 'Created at',
    cell({ row }) {
      const date = row.original.createdAt;
      return <div>{formatDate(date)}</div>;
    },
  },
];
