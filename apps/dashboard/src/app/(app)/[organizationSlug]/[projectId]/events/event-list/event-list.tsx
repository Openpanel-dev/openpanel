'use client';

import { Fragment } from 'react';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import { Pagination } from '@/components/pagination';
import { Button } from '@/components/ui/button';
import { useCursor } from '@/hooks/useCursor';
import { useEventQueryFilters } from '@/hooks/useEventQueryFilters';
import { isSameDay } from 'date-fns';
import { GanttChartIcon } from 'lucide-react';

import type { IServiceEvent } from '@openpanel/db';

import { EventListItem } from './event-list-item';
import EventListener from './event-listener';

function showDateHeader(a: Date, b?: Date) {
  if (!b) return true;
  return !isSameDay(a, b);
}

interface EventListProps {
  data: IServiceEvent[];
  count: number;
}

function EventList({ data, count }: EventListProps) {
  const { cursor, setCursor, loading } = useCursor();
  const [filters] = useEventQueryFilters();

  return (
    <>
      {data.length === 0 ? (
        <FullPageEmptyState title="No events here" icon={GanttChartIcon}>
          {cursor !== 0 ? (
            <>
              <p>Looks like you have reached the end of the list</p>
              <Button
                className="mt-4"
                variant="outline"
                size="sm"
                onClick={() => setCursor((p) => Math.max(0, p - 1))}
              >
                Go back
              </Button>
            </>
          ) : (
            <>
              {filters.length ? (
                <p>Could not find any events with your filter</p>
              ) : (
                <p>We have not received any events yet</p>
              )}
            </>
          )}
        </FullPageEmptyState>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {data.map((item, index, list) => (
              <Fragment key={item.id}>
                {showDateHeader(item.createdAt, list[index - 1]?.createdAt) && (
                  <div className="flex flex-row justify-between gap-2 [&:not(:first-child)]:mt-12">
                    {index === 0 ? <EventListener /> : <div />}
                    <div className="flex gap-2">
                      <div className="flex h-8 items-center gap-2 rounded border border-def-200 bg-def-200 px-3 text-sm font-medium leading-none">
                        {item.createdAt.toLocaleDateString()}
                      </div>
                      {index === 0 && (
                        <Pagination
                          size="sm"
                          cursor={cursor}
                          setCursor={setCursor}
                          count={count}
                          take={50}
                          loading={loading}
                        />
                      )}
                    </div>
                  </div>
                )}
                <EventListItem {...item} />
              </Fragment>
            ))}
          </div>
          <Pagination
            className="mt-2"
            cursor={cursor}
            setCursor={setCursor}
            count={count}
            take={50}
            loading={loading}
          />
        </>
      )}
    </>
  );
}

export default EventList;
