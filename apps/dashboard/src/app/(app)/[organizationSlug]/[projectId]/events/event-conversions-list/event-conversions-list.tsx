'use client';

import { Fragment } from 'react';
import { Widget, WidgetHead } from '@/components/widget';
import { isSameDay } from 'date-fns';

import type { IServiceEvent } from '@openpanel/db';

import { EventListItem } from '../event-list/event-list-item';

function showDateHeader(a: Date, b?: Date) {
  if (!b) return true;
  return !isSameDay(a, b);
}

interface EventListProps {
  data: IServiceEvent[];
}
export function EventConversionsList({ data }: EventListProps) {
  return (
    <Widget className="w-full">
      <WidgetHead>
        <div className="title">Conversions</div>
      </WidgetHead>
      <div className="flex max-h-80 flex-col gap-2 overflow-y-auto p-4">
        {data.map((item, index, list) => (
          <Fragment key={item.id}>
            {showDateHeader(item.createdAt, list[index - 1]?.createdAt) && (
              <div className="flex flex-row justify-between gap-2 [&:not(:first-child)]:mt-12">
                <div className="flex gap-2">
                  <div className="flex h-8 items-center gap-2 rounded border border-def-200 bg-def-200 px-3 text-sm font-medium leading-none">
                    {item.createdAt.toLocaleDateString()}
                  </div>
                </div>
              </div>
            )}
            <EventListItem {...item} />
          </Fragment>
        ))}
      </div>
    </Widget>
  );
}
