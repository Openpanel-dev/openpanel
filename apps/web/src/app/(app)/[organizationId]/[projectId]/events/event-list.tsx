'use client';

import { Suspense } from 'react';
import { FullPageEmptyState } from '@/components/FullPageEmptyState';
import { Pagination } from '@/components/Pagination';
import { Button } from '@/components/ui/button';
import { useCursor } from '@/hooks/useCursor';
import { useEventFilters } from '@/hooks/useEventQueryFilters';
import { GanttChartIcon } from 'lucide-react';

import type { IServiceCreateEventPayload } from '@mixan/db';

import { EventListItem } from './event-list-item';

interface EventListProps {
  data: IServiceCreateEventPayload[];
  count: number;
}
export function EventList({ data, count }: EventListProps) {
  const { cursor, setCursor } = useCursor();
  const filters = useEventFilters();

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
              {data.map((item) => (
                <EventListItem key={item.id} {...item} />
              ))}
            </div>
            <Pagination cursor={cursor} setCursor={setCursor} />
          </>
        )}
      </div>
    </Suspense>
  );
}
