import type { UseQueryResult } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table/data-table';
import { DataTableToolbar } from '@/components/ui/data-table/data-table-toolbar';
import { useTable } from '@/components/ui/data-table/use-table';
import { pushModal } from '@/modals';
import type { RouterOutputs } from '@/trpc/client';
import { PlusIcon } from 'lucide-react';
import { useColumns } from './columns';

type Props = {
  query: UseQueryResult<RouterOutputs['client']['list'], unknown>;
};

export const ClientsTable = ({ query }: Props) => {
  const columns = useColumns();
  const { data, isLoading } = query;

  const { table } = useTable({
    columns,
    data: data ?? [],
    loading: isLoading,
    pageSize: 50,
  });

  return (
    <>
      <DataTableToolbar table={table}>
        <Button
          icon={PlusIcon}
          responsive
          onClick={() => pushModal('AddClient')}
        >
          Create client
        </Button>
      </DataTableToolbar>
      <DataTable table={table} loading={isLoading} />
    </>
  );
};
