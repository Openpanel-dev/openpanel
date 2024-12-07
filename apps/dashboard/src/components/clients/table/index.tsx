import { DataTable } from '@/components/data-table';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import { Pagination } from '@/components/pagination';
import { Button } from '@/components/ui/button';
import { TableSkeleton } from '@/components/ui/table';
import type { UseQueryResult } from '@tanstack/react-query';
import { GanttChartIcon, PlusIcon } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';

import type { IServiceClientWithProject } from '@openpanel/db';

import { useAppParams } from '@/hooks/useAppParams';
import { pushModal } from '@/modals';
import { useColumns } from './columns';

type Props = {
  query: UseQueryResult<IServiceClientWithProject[]>;
  cursor: number;
  setCursor: Dispatch<SetStateAction<number>>;
};

export const ClientsTable = ({ query, ...props }: Props) => {
  const columns = useColumns();
  const { data, isFetching, isLoading } = query;

  if (isLoading) {
    return <TableSkeleton cols={columns.length} />;
  }

  if (data?.length === 0) {
    return (
      <FullPageEmptyState title="No clients here" icon={GanttChartIcon}>
        <p>Could not find any clients</p>
        <div className="row gap-4 mt-4">
          {'cursor' in props && props.cursor !== 0 && (
            <Button
              className="mt-8"
              variant="outline"
              onClick={() => props.setCursor((p) => p - 1)}
            >
              Go to previous page
            </Button>
          )}
          <Button icon={PlusIcon} onClick={() => pushModal('AddClient')}>
            Add client
          </Button>
        </div>
      </FullPageEmptyState>
    );
  }

  return (
    <>
      <DataTable data={data ?? []} columns={columns} />
      {'cursor' in props && (
        <Pagination
          className="mt-2"
          setCursor={props.setCursor}
          cursor={props.cursor}
          count={Number.POSITIVE_INFINITY}
          take={50}
          loading={isFetching}
        />
      )}
    </>
  );
};
