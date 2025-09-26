'use client';

import { ColorSquare } from '@/components/color-square';
import { ComboboxEvents } from '@/components/ui/combobox-events';
import { Input } from '@/components/ui/input';
import { useAppParams } from '@/hooks/useAppParams';
import { useDebounceFn } from '@/hooks/useDebounceFn';
import { useEventNames } from '@/hooks/useEventNames';
import { useDispatch, useSelector } from '@/redux';
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { shortId } from '@openpanel/common';
import { alphabetIds } from '@openpanel/constants';
import type { IChartEvent } from '@openpanel/validation';
import { FilterIcon, HandIcon } from 'lucide-react';
import { ReportSegment } from '../ReportSegment';
import {
  addEvent,
  changeEvent,
  duplicateEvent,
  removeEvent,
  reorderEvents,
} from '../reportSlice';
import { EventPropertiesCombobox } from './EventPropertiesCombobox';
import { PropertiesCombobox } from './PropertiesCombobox';
import type { ReportEventMoreProps } from './ReportEventMore';
import { ReportEventMore } from './ReportEventMore';
import { FiltersList } from './filters/FiltersList';

function SortableEvent({
  event,
  index,
  showSegment,
  showAddFilter,
  isSelectManyEvents,
  ...props
}: {
  event: IChartEvent;
  index: number;
  showSegment: boolean;
  showAddFilter: boolean;
  isSelectManyEvents: boolean;
} & React.HTMLAttributes<HTMLDivElement>) {
  const dispatch = useDispatch();
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: event.id ?? '' });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...props}>
      <div className="flex items-center gap-2 p-2 group">
        <button className="cursor-grab active:cursor-grabbing" {...listeners}>
          <ColorSquare className="relative">
            <HandIcon className="size-3 opacity-0 scale-50 group-hover:opacity-100 group-hover:scale-100 transition-all absolute inset-1" />
            <span className="block group-hover:opacity-0 group-hover:scale-0 transition-all">
              {alphabetIds[index]}
            </span>
          </ColorSquare>
        </button>
        {props.children}
      </div>

      {/* Segment and Filter buttons */}
      {(showSegment || showAddFilter) && (
        <div className="flex gap-2 p-2 pt-0">
          {showSegment && (
            <ReportSegment
              value={event.segment}
              onChange={(segment) => {
                dispatch(
                  changeEvent({
                    ...event,
                    segment,
                  }),
                );
              }}
            />
          )}
          {showAddFilter && (
            <PropertiesCombobox
              event={event}
              onSelect={(action) => {
                dispatch(
                  changeEvent({
                    ...event,
                    filters: [
                      ...event.filters,
                      {
                        id: shortId(),
                        name: action.value,
                        operator: 'is',
                        value: [],
                      },
                    ],
                  }),
                );
              }}
            >
              {(setOpen) => (
                <button
                  onClick={() => setOpen((p) => !p)}
                  type="button"
                  className="flex items-center gap-1 rounded-md border border-border bg-card p-1 px-2 text-sm font-medium leading-none"
                >
                  <FilterIcon size={12} /> Add filter
                </button>
              )}
            </PropertiesCombobox>
          )}

          {showSegment && event.segment.startsWith('property_') && (
            <EventPropertiesCombobox event={event} />
          )}
        </div>
      )}

      {/* Filters */}
      {!isSelectManyEvents && <FiltersList event={event} />}
    </div>
  );
}

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

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = selectedEvents.findIndex((e) => e.id === active.id);
      const newIndex = selectedEvents.findIndex((e) => e.id === over.id);

      dispatch(reorderEvents({ fromIndex: oldIndex, toIndex: newIndex }));
    }
  };

  const handleMore = (event: IChartEvent) => {
    const callback: ReportEventMoreProps['onClick'] = (action) => {
      switch (action) {
        case 'remove': {
          return dispatch(removeEvent(event));
        }
        case 'duplicate': {
          return dispatch(duplicateEvent(event));
        }
      }
    };

    return callback;
  };

  return (
    <div>
      <h3 className="mb-2 font-medium">Events</h3>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={selectedEvents.map((e) => ({ id: e.id ?? '' }))}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-4">
            {selectedEvents.map((event, index) => {
              return (
                <SortableEvent
                  key={event.id}
                  event={event}
                  index={index}
                  showSegment={showSegment}
                  showAddFilter={showAddFilter}
                  isSelectManyEvents={isSelectManyEvents}
                  className="rounded-lg border bg-def-100"
                >
                  <ComboboxEvents
                    className="flex-1"
                    searchable
                    multiple={isSelectManyEvents as false}
                    value={
                      (isSelectManyEvents
                        ? (event.filters[0]?.value ?? [])
                        : event.name) as any
                    }
                    onChange={(value) => {
                      dispatch(
                        changeEvent(
                          Array.isArray(value)
                            ? {
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
                              }
                            : {
                                ...event,
                                name: value,
                                filters: [],
                              },
                        ),
                      );
                    }}
                    items={eventNames}
                    placeholder="Select event"
                  />
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
                </SortableEvent>
              );
            })}

            <ComboboxEvents
              disabled={isAddEventDisabled}
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
              placeholder="Select event"
              items={eventNames}
            />
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
