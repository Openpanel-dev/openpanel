'use client';

import { api } from '@/app/_trpc/client';
import { ColorSquare } from '@/components/ColorSquare';
import { Dropdown } from '@/components/Dropdown';
import { Checkbox } from '@/components/ui/checkbox';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { useAppParams } from '@/hooks/useAppParams';
import { useDebounceFn } from '@/hooks/useDebounceFn';
import { useDispatch, useSelector } from '@/redux';
import type { IChartEvent } from '@/types';
import { GanttChart, GanttChartIcon, Users } from 'lucide-react';

import {
  addEvent,
  changeEvent,
  changePrevious,
  removeEvent,
} from '../reportSlice';
import { EventPropertiesCombobox } from './EventPropertiesCombobox';
import { FiltersCombobox } from './filters/FiltersCombobox';
import { FiltersList } from './filters/FiltersList';
import { ReportEventMore } from './ReportEventMore';
import type { ReportEventMoreProps } from './ReportEventMore';

export function ReportEvents() {
  const previous = useSelector((state) => state.report.previous);
  const selectedEvents = useSelector((state) => state.report.events);
  const dispatch = useDispatch();
  const params = useAppParams();
  const eventsQuery = api.chart.events.useQuery({
    projectId: params.projectId,
  });
  const eventsCombobox = (eventsQuery.data ?? []).map((item) => ({
    value: item.name,
    label: item.name,
  }));
  const dispatchChangeEvent = useDebounceFn((event: IChartEvent) => {
    dispatch(changeEvent(event));
  });

  const handleMore = (event: IChartEvent) => {
    const callback: ReportEventMoreProps['onClick'] = (action) => {
      switch (action) {
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
                  icon={GanttChartIcon}
                  className="flex-1"
                  searchable
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
                <Input
                  placeholder={
                    event.name ? `${event.name} (${event.id})` : 'Display name'
                  }
                  defaultValue={event.displayName}
                  onChange={(e) => {
                    dispatchChangeEvent({
                      ...event,
                      displayName: e.target.value,
                    });
                  }}
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
                    {
                      value: 'user_average',
                      label: 'Average event per user',
                    },
                    {
                      value: 'one_event_per_user',
                      label: 'One event per user',
                    },
                    {
                      value: 'property_sum',
                      label: 'Sum of property',
                    },
                    {
                      value: 'property_average',
                      label: 'Average of property',
                    },
                  ]}
                  label="Segment"
                >
                  <button className="flex items-center gap-1 rounded-md border border-border p-1 px-2 font-medium leading-none text-xs">
                    {event.segment === 'user' ? (
                      <>
                        <Users size={12} /> Unique users
                      </>
                    ) : event.segment === 'user_average' ? (
                      <>
                        <Users size={12} /> Average event per user
                      </>
                    ) : event.segment === 'one_event_per_user' ? (
                      <>
                        <Users size={12} /> One event per user
                      </>
                    ) : event.segment === 'property_sum' ? (
                      <>
                        <Users size={12} /> Sum of property
                      </>
                    ) : event.segment === 'property_average' ? (
                      <>
                        <Users size={12} /> Average of property
                      </>
                    ) : (
                      <>
                        <GanttChart size={12} /> All events
                      </>
                    )}
                  </button>
                </Dropdown>
                {/*  */}
                <FiltersCombobox event={event} />

                {(event.segment === 'property_average' ||
                  event.segment === 'property_sum') && (
                  <EventPropertiesCombobox event={event} />
                )}
              </div>

              {/* Filters */}
              <FiltersList event={event} />
            </div>
          );
        })}

        <Combobox
          icon={GanttChartIcon}
          value={''}
          searchable
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
      <label
        className="flex items-center gap-2 cursor-pointer select-none text-sm font-medium mt-4"
        htmlFor="previous"
      >
        <Checkbox
          id="previous"
          checked={previous}
          onCheckedChange={(val) => dispatch(changePrevious(!!val))}
        />
        Show previous / Compare
      </label>
    </div>
  );
}
