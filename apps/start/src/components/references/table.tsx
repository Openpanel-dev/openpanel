import { DataTable } from '@/components/data-table';
import { formatDate, formatDateTime } from '@/utils/date';
import type { ColumnDef } from '@tanstack/react-table';

import type { IServiceReference } from '@openpanel/db';

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

export function ReferencesTable({ data }: { data: IServiceReference[] }) {
  return <DataTable data={data} columns={columns} />;
}
