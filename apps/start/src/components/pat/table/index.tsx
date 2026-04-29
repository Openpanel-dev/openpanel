import type { UseQueryResult } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { useColumns } from './columns';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table/data-table';
import { DataTableToolbar } from '@/components/ui/data-table/data-table-toolbar';
import { useTable } from '@/components/ui/data-table/use-table';
import { pushModal } from '@/modals';
import type { RouterOutputs } from '@/trpc/client';

interface Props {
  organizationId: string;
  query: UseQueryResult<RouterOutputs['pat']['list'], unknown>;
}

export const PATTable = ({ organizationId, query }: Props) => {
  const columns = useColumns(organizationId);
  const { data, isLoading } = query;

  const { table } = useTable({
    name: 'pat',
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
          onClick={() => pushModal('CreatePAT', { organizationId })}
          responsive
        >
          Create token
        </Button>
      </DataTableToolbar>
      <DataTable loading={isLoading} table={table} />
    </>
  );
};
