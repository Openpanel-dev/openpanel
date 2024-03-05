'use client';

import { Fragment, Suspense } from 'react';
import { FullPageEmptyState } from '@/components/FullPageEmptyState';
import { Pagination } from '@/components/Pagination';
import { Button } from '@/components/ui/button';
import { useCursor } from '@/hooks/useCursor';
import { useEventQueryFilters } from '@/hooks/useEventQueryFilters';
import { isSameDay } from 'date-fns';
import { GanttChartIcon } from 'lucide-react';

import type { IServiceCreateEventPayload } from '@mixan/db';

import { EventListItem } from './event-list-item';

function showDateHeader(a: Date, b?: Date) {
  if (!b) return true;
  return !isSameDay(a, b);
}

interface EventListProps {
  data: IServiceCreateEventPayload[];
  count: number;
}
export function EventList({ data, count }: EventListProps) {
  const { cursor, setCursor } = useCursor();
  const [filters] = useEventQueryFilters();
  return (
    <Suspense>
      <div className="p-4">
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
                  <p>We have not recieved any events yet</p>
                )}
              </>
            )}
          </FullPageEmptyState>
        ) : (
          <>
            <Pagination
              cursor={cursor}
              setCursor={setCursor}
              count={count}
              take={50}
            />
            <div className="flex flex-col gap-4 my-4">
              {data.map((item, index, list) => (
                <Fragment key={item.id}>
                  {showDateHeader(
                    item.createdAt,
                    list[index - 1]?.createdAt
                  ) && (
                    <div className="font-medium text-xs [&:not(:first-child)]:mt-12">
                      {item.createdAt.toLocaleDateString()}
                    </div>
                  )}
                  <EventListItem {...item} />
                </Fragment>
              ))}
            </div>
            <Pagination
              cursor={cursor}
              setCursor={setCursor}
              count={count}
              take={50}
            />
          </>
        )}
      </div>
    </Suspense>
  );
}
