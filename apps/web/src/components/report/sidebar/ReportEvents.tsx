import { useState } from 'react';
import { ColorSquare } from '@/components/ColorSquare';
import { Dropdown } from '@/components/Dropdown';
import { Combobox } from '@/components/ui/combobox';
import { useDispatch, useSelector } from '@/redux';
import type { IChartEvent } from '@/types';
import { api } from '@/utils/api';
import { Filter, GanttChart, Users } from 'lucide-react';

import { addEvent, changeEvent, removeEvent } from '../reportSlice';
import { ReportEventFilters } from './ReportEventFilters';
import { ReportEventMore } from './ReportEventMore';
import type { ReportEventMoreProps } from './ReportEventMore';

export function ReportEvents() {
  const [isCreating, setIsCreating] = useState(false);
  const selectedEvents = useSelector((state) => state.report.events);
  const dispatch = useDispatch();
  const eventsQuery = api.chart.events.useQuery();
  const eventsCombobox = (eventsQuery.data ?? []).map((item) => ({
    value: item.name,
    label: item.name,
  }));

  const handleMore = (event: IChartEvent) => {
    const callback: ReportEventMoreProps['onClick'] = (action) => {
      switch (action) {
        case 'createFilter': {
          return setIsCreating(true);
        }
        case 'remove': {
          return dispatch(removeEvent(event));
        }
      }
    };

    return callback;
  };

  return (
    <div>
      <h3 className="mb-2 font-medium">Events</h3>
      <div className="flex flex-col gap-4">
        {selectedEvents.map((event) => {
          return (
            <div key={event.name} className="rounded-lg border">
              <div className="flex items-center gap-2 p-2">
                <ColorSquare>{event.id}</ColorSquare>
                <Combobox
                  value={event.name}
                  onChange={(value) => {
                    dispatch(
                      changeEvent({
                        ...event,
                        name: value,
                        filters: [],
                      })
                    );
                  }}
                  items={eventsCombobox}
                  placeholder="Select event"
                />
                <ReportEventMore onClick={handleMore(event)} />
              </div>

              {/* Segment and Filter buttons */}
              <div className="flex gap-2 p-2 pt-0 text-sm">
                <Dropdown
                  onChange={(segment) => {
                    dispatch(
                      changeEvent({
                        ...event,
                        segment,
                      })
                    );
                  }}
                  items={[
                    {
                      value: 'event',
                      label: 'All events',
                    },
                    {
                      value: 'user',
                      label: 'Unique users',
                    },
                  ]}
                  label="Segment"
                >
                  <button className="flex items-center gap-1 rounded-md border border-border p-1 px-2 font-medium leading-none text-xs">
                    {event.segment === 'user' ? (
                      <>
                        <Users size={12} /> Unique users
                      </>
                    ) : (
                      <>
                        <GanttChart size={12} /> All events
                      </>
                    )}
                  </button>
                </Dropdown>
                <button
                  onClick={() => {
                    handleMore(event)('createFilter');
                  }}
                  className="flex items-center gap-1 rounded-md border border-border p-1 px-2 font-medium leading-none text-xs"
                >
                  <Filter size={12} /> Filter
                </button>
              </div>

              {/* Filters */}
              <ReportEventFilters {...{ isCreating, setIsCreating, event }} />
            </div>
          );
        })}

        <Combobox
          value={''}
          onChange={(value) => {
            dispatch(
              addEvent({
                name: value,
                segment: 'event',
                filters: [],
              })
            );
          }}
          items={eventsCombobox}
          placeholder="Select event"
        />
      </div>
    </div>
  );
}
