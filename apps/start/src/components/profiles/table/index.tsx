import { DataTable } from '@/components/data-table';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import { Button } from '@/components/ui/button';
import { TableSkeleton } from '@/components/ui/table';
import type { UseQueryResult } from '@tanstack/react-query';
import isEqual from 'lodash.isequal';
import { GanttChartIcon } from 'lucide-react';
import { memo } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { IServiceProfile } from '@openpanel/db';

import { FloatingPagination } from '@/components/pagination-floating';
import { useColumns } from './columns';

type CommonProps = {
  type?: 'profiles' | 'power-users';
  query: UseQueryResult<IServiceProfile[]>;
};
type Props =
  | CommonProps
  | (CommonProps & {
      cursor: number;
      setCursor: Dispatch<SetStateAction<number>>;
    });

export const ProfilesTable = memo(
  ({ type, query, ...props }: Props) => {
    const columns = useColumns(type);
    const { data, isFetching, isLoading } = query;

    if (isLoading) {
      return <TableSkeleton cols={columns.length} />;
    }

    if (data?.length === 0) {
      return (
        <FullPageEmptyState title="No profiles here" icon={GanttChartIcon}>
          <p>Could not find any profiles</p>
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
          <FloatingPagination
            setCursor={props.setCursor}
            cursor={props.cursor}
            count={Number.POSITIVE_INFINITY}
            take={50}
            loading={isFetching}
          />
        )}
      </>
    );
  },
  (prevProps, nextProps) => {
    return isEqual(prevProps.query.data, nextProps.query.data);
  },
);

ProfilesTable.displayName = 'ProfilesTable';
