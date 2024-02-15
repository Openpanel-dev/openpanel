'use client';

import { FullPageEmptyState } from '@/components/FullPageEmptyState';
import { Pagination } from '@/components/Pagination';
import { Button } from '@/components/ui/button';
import { useCursor } from '@/hooks/useCursor';
import { GanttChartIcon } from 'lucide-react';
import { last } from 'ramda';

import { IServiceCreateEventPayload } from '@mixan/db';

import { EventListItem } from './event-list-item';

interface EventListProps {
  data: IServiceCreateEventPayload[];
}
export function EventList({ data }: EventListProps) {
  const { cursor, setCursor } = useCursor();
  return (
    <>
      <div className="p-4">
        {data.length === 0 ? (
          <FullPageEmptyState title="No events here" icon={GanttChartIcon}>
            {/* {filterEvents.length ? (
              <p>Could not find any events with your filter</p>
            ) : (
              <p>We have not recieved any events yet</p>
            )} */}
            <p>We have not recieved any events yet</p>
          </FullPageEmptyState>
        ) : (
          <>
            <div className="flex flex-col gap-4">
              {data.map((item) => (
                <EventListItem
                  key={item.createdAt.toString() + item.name + item.profileId}
                  {...item}
                />
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCursor(last(data)?.createdAt ?? null)}
            >
              Next
            </Button>
          </>
        )}
      </div>
    </>
  );
}
