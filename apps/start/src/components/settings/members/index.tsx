import type { IServiceMember } from '@openpanel/db';

import { DataTable } from '@/components/ui/data-table/data-table';
import { DataTableToolbar } from '@/components/ui/data-table/data-table-toolbar';
import { useTable } from '@/components/ui/data-table/use-table';
import type { UseQueryResult } from '@tanstack/react-query';
import { useColumns } from './columns';

type CommonProps = {
  query: UseQueryResult<IServiceMember[], unknown>;
};

type Props = CommonProps;

export const MembersTable = ({ query }: Props) => {
  const columns = useColumns();
  const { data, isLoading } = query;
  const { table } = useTable({
    name: 'members',
    columns,
    data: data ?? [],
    loading: isLoading,
    pageSize: 50,
  });

  return (
    <>
      <DataTableToolbar table={table} />
      <DataTable table={table} loading={isLoading} />
    </>
  );
};
