'use client';

import { ColorSquare } from '@/components/color-square';
import { Checkbox } from '@/components/ui/checkbox';
import { Combobox } from '@/components/ui/combobox';
import { DropdownMenuComposed } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useAppParams } from '@/hooks/useAppParams';
import { useDebounceFn } from '@/hooks/useDebounceFn';
import { useEventNames } from '@/hooks/useEventNames';
import { useDispatch, useSelector } from '@/redux';
import { GanttChart, GanttChartIcon, Users } from 'lucide-react';

import type { IChartEvent } from '@openpanel/validation';

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
  const input = useSelector((state) => state.report);
  const dispatch = useDispatch();
  const { projectId } = useAppParams();
  const eventNames = useEventNames(projectId, {
    startDate: input.startDate,
    endDate: input.endDate,
    range: input.range,
  });

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
            <div key={event.id} className="rounded-lg border bg-def-100">
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
                  items={eventNames.map((item) => ({
                    label: item.name,
                    value: item.name,
                  }))}
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
                <DropdownMenuComposed
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
                      value: 'session',
                      label: 'Unique sessions',
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
                  <button className="flex items-center gap-1 rounded-md border border-border bg-card p-1 px-2 text-xs font-medium leading-none">
                    {event.segment === 'user' ? (
                      <>
                        <Users size={12} /> Unique users
                      </>
                    ) : event.segment === 'session' ? (
                      <>
                        <Users size={12} /> Unique sessions
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
                </DropdownMenuComposed>
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
          items={eventNames.map((item) => ({
            label: item.name,
            value: item.name,
          }))}
          placeholder="Select event"
        />
      </div>
      <label
        className="mt-4 flex cursor-pointer select-none items-center gap-2 text-sm font-medium"
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
