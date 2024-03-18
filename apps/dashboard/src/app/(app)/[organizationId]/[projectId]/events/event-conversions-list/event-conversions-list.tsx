'use client';

import { Fragment } from 'react';
import { Widget, WidgetHead } from '@/components/widget';
import { isSameDay } from 'date-fns';

import type { IServiceCreateEventPayload } from '@openpanel/db';

import { EventListItem } from '../event-list-item';

function showDateHeader(a: Date, b?: Date) {
  if (!b) return true;
  return !isSameDay(a, b);
}

interface EventListProps {
  data: IServiceCreateEventPayload[];
}
export function EventConversionsList({ data }: EventListProps) {
  return (
    <Widget>
      <WidgetHead>
        <div className="title">Conversions</div>
      </WidgetHead>
      <div className="flex flex-col gap-2 overflow-y-auto max-h-80 p-4">
        {data.map((item, index, list) => (
          <Fragment key={item.id}>
            {showDateHeader(item.createdAt, list[index - 1]?.createdAt) && (
              <div className="flex flex-row justify-between gap-2 [&:not(:first-child)]:mt-12">
                <div className="flex gap-2">
                  <div className="bg-slate-100 border border-slate-300 rounded h-8 px-3 leading-none flex items-center text-sm font-medium gap-2">
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
