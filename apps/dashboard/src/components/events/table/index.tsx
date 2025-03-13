import { FullPageEmptyState } from '@/components/full-page-empty-state';
import { TableSkeleton } from '@/components/ui/table';
import type {
  UseInfiniteQueryResult,
  UseQueryResult,
} from '@tanstack/react-query';
import { GanttChartIcon, Loader2Icon } from 'lucide-react';
import { useEffect, useRef } from 'react';

import type { RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { useInViewport } from 'react-in-viewport';
import { useColumns } from './columns';
import { EventsDataTable } from './events-data-table';

type Props =
  | {
      query: UseInfiniteQueryResult<RouterOutputs['event']['events']>;
    }
  | {
      query: UseQueryResult<RouterOutputs['event']['events']>;
    };

export const EventsTable = ({ query, ...props }: Props) => {
  const columns = useColumns();
  const { isLoading } = query;
  const ref = useRef<HTMLDivElement>(null);
  const { inViewport, enterCount } = useInViewport(ref, undefined, {
    disconnectOnLeave: true,
  });
  const isInfiniteQuery = 'fetchNextPage' in query;
  const data =
    (isInfiniteQuery
      ? query.data?.pages?.flatMap((p) => p.items)
      : query.data?.items) ?? [];

  const hasNextPage = isInfiniteQuery
    ? query.data?.pages[query.data.pages.length - 1]?.meta.next
    : query.data?.meta.next;

  useEffect(() => {
    if (
      hasNextPage &&
      isInfiniteQuery &&
      data.length > 0 &&
      inViewport &&
      enterCount > 0 &&
      query.isFetchingNextPage === false
    ) {
      query.fetchNextPage();
    }
  }, [inViewport, enterCount, hasNextPage]);

  if (isLoading) {
    return <TableSkeleton cols={columns.length} />;
  }

  if (data.length === 0) {
    return (
      <FullPageEmptyState title="No events here" icon={GanttChartIcon}>
        <p>Could not find any events</p>
      </FullPageEmptyState>
    );
  }

  return (
    <>
      <EventsDataTable data={data} columns={columns} />
      {isInfiniteQuery && (
        <div className="w-full h-10 center-center pt-10" ref={ref}>
          <div
            className={cn(
              'size-8 bg-background rounded-full center-center border opacity-0 transition-opacity',
              isInfiniteQuery && query.isFetchingNextPage && 'opacity-100',
            )}
          >
            <Loader2Icon className="size-4 animate-spin" />
          </div>
        </div>
      )}
    </>
  );
};
