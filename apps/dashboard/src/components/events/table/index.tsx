import type { Dispatch, SetStateAction } from 'react';
import { DataTable } from '@/components/data-table';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import { Pagination } from '@/components/pagination';
import { Button } from '@/components/ui/button';
import type { UseQueryResult } from '@tanstack/react-query';
import { GanttChartIcon } from 'lucide-react';

import type { IServiceEvent } from '@openpanel/db';

import { useColumns } from './columns';

type Props =
  | {
      query: UseQueryResult<IServiceEvent[]>;
    }
  | {
      query: UseQueryResult<IServiceEvent[]>;
      cursor: number;
      setCursor: Dispatch<SetStateAction<number>>;
    };

export const EventsTable = ({ query, ...props }: Props) => {
  const columns = useColumns();
  const { data, isFetching, isLoading } = query;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <div className="card h-[74px] w-full animate-pulse items-center justify-between rounded-lg p-4"></div>
        <div className="card h-[74px] w-full animate-pulse items-center justify-between rounded-lg p-4"></div>
        <div className="card h-[74px] w-full animate-pulse items-center justify-between rounded-lg p-4"></div>
        <div className="card h-[74px] w-full animate-pulse items-center justify-between rounded-lg p-4"></div>
        <div className="card h-[74px] w-full animate-pulse items-center justify-between rounded-lg p-4"></div>
      </div>
    );
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
          count={Infinity}
          take={50}
          loading={isFetching}
        />
      )}
    </>
  );
};
