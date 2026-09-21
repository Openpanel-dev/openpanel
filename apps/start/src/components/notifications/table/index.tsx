import type { UseQueryResult } from '@tanstack/react-query';
import { useColumns } from './columns';
import { DataTable } from '@/components/ui/data-table/data-table';
import { DataTableToolbar } from '@/components/ui/data-table/data-table-toolbar';
import { useTable } from '@/components/ui/data-table/use-table';
import type { RouterOutputs } from '@/trpc/client';

type Props = {
  query: UseQueryResult<
    RouterOutputs['notification']['list'][number][],
    unknown
  >;
};

export const NotificationsTable = ({ query }: Props) => {
  const columns = useColumns();
  const { data, isLoading } = query;
  const { table } = useTable({
    name: 'notifications',
    columns,
    data: data ?? [],
    loading: isLoading,
    pageSize: 50,
  });

  return (
    <>
      <DataTableToolbar table={table} />
      <DataTable loading={isLoading} table={table} />
    </>
  );
};
