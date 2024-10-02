import { DataTable } from '@/components/data-table';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import { Pagination } from '@/components/pagination';
import { Button } from '@/components/ui/button';
import { TableSkeleton } from '@/components/ui/table';
import type { UseQueryResult } from '@tanstack/react-query';
import { GanttChartIcon } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';

import type { Notification } from '@openpanel/db';

import { useColumns } from './columns';

type Props =
  | {
      query: UseQueryResult<Notification[]>;
    }
  | {
      query: UseQueryResult<Notification[]>;
      cursor: number;
      setCursor: Dispatch<SetStateAction<number>>;
    };

export const NotificationsTable = ({ query, ...props }: Props) => {
  const columns = useColumns();
  const { data, isFetching, isLoading } = query;

  if (isLoading) {
    return <TableSkeleton cols={columns.length} />;
  }

  if (data?.length === 0) {
    return (
      <FullPageEmptyState title="No events here" icon={GanttChartIcon}>
        <p>Could not find any events</p>
        {'cursor' in props && props.cursor !== 0 && (
          <Button
            className="mt-8"
            variant="outline"
            onClick={() => props.setCursor((p) => p - 1)}
          >
            Go to previous page
          </Button>
        )}
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
