'use client';

import { ColorSquare } from '@/components/color-square';
import { Combobox } from '@/components/ui/combobox';
import { DropdownMenuComposed } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useAppParams } from '@/hooks/useAppParams';
import { useDebounceFn } from '@/hooks/useDebounceFn';
import { useEventNames } from '@/hooks/useEventNames';
import { useDispatch, useSelector } from '@/redux';
import { GanttChart, GanttChartIcon, Users } from 'lucide-react';

import { alphabetIds } from '@openpanel/constants';
import type { IChartEvent } from '@openpanel/validation';

import { ComboboxAdvanced } from '@/components/ui/combobox-advanced';
import { addEvent, changeEvent, removeEvent } from '../reportSlice';
import { EventPropertiesCombobox } from './EventPropertiesCombobox';
import { ReportEventMore } from './ReportEventMore';
import type { ReportEventMoreProps } from './ReportEventMore';
import { FiltersCombobox } from './filters/FiltersCombobox';
import { FiltersList } from './filters/FiltersList';

export function ReportEvents() {
  const selectedEvents = useSelector((state) => state.report.events);
  const chartType = useSelector((state) => state.report.chartType);
  const dispatch = useDispatch();
  const { projectId } = useAppParams();
  const eventNames = useEventNames({
    projectId,
  });
  const showSegment = !['retention', 'funnel'].includes(chartType);
  const showAddFilter = !['retention'].includes(chartType);
  const showDisplayNameInput = !['retention'].includes(chartType);
  const isAddEventDisabled =
    (chartType === 'retention' || chartType === 'conversion') &&
    selectedEvents.length >= 2;
  const dispatchChangeEvent = useDebounceFn((event: IChartEvent) => {
    dispatch(changeEvent(event));
  });
  const isSelectManyEvents = chartType === 'retention';

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
        {selectedEvents.map((event, index) => {
          return (
            <div key={event.id} className="rounded-lg border bg-def-100">
              <div className="flex items-center gap-2 p-2">
                <ColorSquare>{alphabetIds[index]}</ColorSquare>
                {isSelectManyEvents ? (
                  <ComboboxAdvanced
                    className="flex-1"
                    value={event.filters[0]?.value ?? []}
                    onChange={(value) => {
                      dispatch(
                        changeEvent({
                          id: event.id,
                          segment: 'user',
                          filters: [
                            {
                              name: 'name',
                              operator: 'is',
                              value: value,
                            },
                          ],
                          name: '*',
                        }),
                      );
                    }}
                    items={eventNames.map((item) => ({
                      label: item.name,
                      value: item.name,
                    }))}
                    placeholder="Select event"
                  />
                ) : (
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
                        }),
                      );
                    }}
                    items={eventNames.map((item) => ({
                      label: item.name,
                      value: item.name,
                    }))}
                    placeholder="Select event"
                  />
                )}
                {showDisplayNameInput && (
                  <Input
                    placeholder={
                      event.name
                        ? `${event.name} (${alphabetIds[index]})`
                        : 'Display name'
                    }
                    defaultValue={event.displayName}
                    onChange={(e) => {
                      dispatchChangeEvent({
                        ...event,
                        displayName: e.target.value,
                      });
                    }}
                  />
                )}
                <ReportEventMore onClick={handleMore(event)} />
              </div>

              {/* Segment and Filter buttons */}
              {(showSegment || showAddFilter) && (
                <div className="flex gap-2 p-2 pt-0 ">
                  {showSegment && (
                    <DropdownMenuComposed
                      onChange={(segment) => {
                        dispatch(
                          changeEvent({
                            ...event,
                            segment,
                          }),
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
                      <button
                        type="button"
                        className="flex items-center gap-1 rounded-md border border-border bg-card p-1 px-2 text-sm font-medium leading-none"
                      >
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
                  )}
                  {/*  */}
                  {showAddFilter && <FiltersCombobox event={event} />}

                  {showSegment &&
                    (event.segment === 'property_average' ||
                      event.segment === 'property_sum') && (
                      <EventPropertiesCombobox event={event} />
                    )}
                </div>
              )}

              {/* Filters */}
              {!isSelectManyEvents && <FiltersList event={event} />}
            </div>
          );
        })}

        <Combobox
          disabled={isAddEventDisabled}
          icon={GanttChartIcon}
          value={''}
          searchable
          onChange={(value) => {
            if (isSelectManyEvents) {
              dispatch(
                addEvent({
                  segment: 'user',
                  name: value,
                  filters: [
                    {
                      name: 'name',
                      operator: 'is',
                      value: [value],
                    },
                  ],
                }),
              );
            } else {
              dispatch(
                addEvent({
                  name: value,
                  segment: 'event',
                  filters: [],
                }),
              );
            }
          }}
          items={eventNames.map((item) => ({
            label: item.name,
            value: item.name,
          }))}
          placeholder="Select event"
        />
      </div>
    </div>
  );
}
