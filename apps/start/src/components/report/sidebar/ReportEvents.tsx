import { ColorSquare } from '@/components/color-square';
import { ComboboxEvents } from '@/components/ui/combobox-events';
import { Input } from '@/components/ui/input';
import { useAppParams } from '@/hooks/use-app-params';
import { useDebounceFn } from '@/hooks/use-debounce-fn';
import { useEventNames } from '@/hooks/use-event-names';
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
import type { IChartEvent, IChartEventItem, IChartFormula } from '@openpanel/validation';
import { FilterIcon, HandIcon, PlusIcon } from 'lucide-react';
import { ReportSegment } from '../ReportSegment';
import {
  addEvent,
  addFormula,
  changeEvent,
  duplicateEvent,
  removeEvent,
  reorderEvents,
} from '../reportSlice';
import { InputEnter } from '@/components/ui/input-enter';
import { Button } from '@/components/ui/button';
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
  event: IChartEventItem | IChartEvent;
  index: number;
  showSegment: boolean;
  showAddFilter: boolean;
  isSelectManyEvents: boolean;
} & React.HTMLAttributes<HTMLDivElement>) {
  const dispatch = useDispatch();
  const eventId = 'type' in event ? event.id : (event as IChartEvent).id;
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: eventId ?? '' });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Normalize event to have type field
  const normalizedEvent: IChartEventItem =
    'type' in event ? event : { ...event, type: 'event' as const };

  const isFormula = normalizedEvent.type === 'formula';
  const chartEvent = isFormula ? null : (normalizedEvent as IChartEventItem & { type: 'event' });

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

      {/* Segment and Filter buttons - only for events */}
      {chartEvent && (showSegment || showAddFilter) && (
        <div className="flex gap-2 p-2 pt-0">
          {showSegment && (
            <ReportSegment
              value={chartEvent.segment}
              onChange={(segment) => {
                dispatch(
                  changeEvent({
                    ...chartEvent,
                    segment,
                  }),
                );
              }}
            />
          )}
          {showAddFilter && (
            <PropertiesCombobox
              event={chartEvent}
              onSelect={(action) => {
                dispatch(
                  changeEvent({
                    ...chartEvent,
                    filters: [
                      ...chartEvent.filters,
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

          {showSegment && chartEvent.segment.startsWith('property_') && (
            <EventPropertiesCombobox event={chartEvent} />
          )}
        </div>
      )}

      {/* Filters - only for events */}
      {chartEvent && !isSelectManyEvents && <FiltersList event={chartEvent} />}
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

  const handleMore = (event: IChartEventItem | IChartEvent) => {
    const callback: ReportEventMoreProps['onClick'] = (action) => {
      switch (action) {
        case 'remove': {
          return dispatch(removeEvent({ id: 'type' in event ? event.id : (event as IChartEvent).id }));
        }
        case 'duplicate': {
          const normalized = 'type' in event ? event : { ...event, type: 'event' as const };
          return dispatch(duplicateEvent(normalized));
        }
      }
    };

    return callback;
  };

  const dispatchChangeFormula = useDebounceFn((formula: IChartFormula) => {
    dispatch(changeEvent(formula));
  });

  const showFormula = chartType !== 'conversion' && chartType !== 'funnel' && chartType !== 'retention';

  return (
    <div>
      <h3 className="mb-2 font-medium">Metrics</h3>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={selectedEvents.map((e) => ({ id: ('type' in e ? e.id : (e as IChartEvent).id) ?? '' }))}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-4">
            {selectedEvents.map((event, index) => {
              // Normalize event to have type field
              const normalized: IChartEventItem =
                'type' in event ? event : { ...event, type: 'event' as const };
              const isFormula = normalized.type === 'formula';

              return (
                <SortableEvent
                  key={normalized.id}
                  event={normalized}
                  index={index}
                  showSegment={showSegment}
                  showAddFilter={showAddFilter}
                  isSelectManyEvents={isSelectManyEvents}
                  className="rounded-lg border bg-def-100"
                >
                  {isFormula ? (
                    <>
                      <div className="flex-1 flex flex-col gap-2">
                        <InputEnter
                          placeholder="eg: A+B, A/B"
                          value={normalized.formula}
                          onChangeValue={(value) => {
                            dispatchChangeFormula({
                              ...normalized,
                              formula: value,
                            });
                          }}
                        />
                        {showDisplayNameInput && (
                          <Input
                            placeholder={`Formula (${alphabetIds[index]})`}
                            defaultValue={normalized.displayName}
                            onChange={(e) => {
                              dispatchChangeFormula({
                                ...normalized,
                                displayName: e.target.value,
                              });
                            }}
                          />
                        )}
                      </div>
                      <ReportEventMore onClick={handleMore(normalized)} />
                    </>
                  ) : (
                    <>
                      <ComboboxEvents
                        className="flex-1"
                        searchable
                        multiple={isSelectManyEvents as false}
                        value={
                          (isSelectManyEvents
                            ? ((normalized as IChartEventItem & { type: 'event' }).filters[0]?.value ?? [])
                            : (normalized as IChartEventItem & { type: 'event' }).name) as any
                        }
                        onChange={(value) => {
                          dispatch(
                            changeEvent(
                              Array.isArray(value)
                                ? {
                                    id: normalized.id,
                                    type: 'event',
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
                                    ...normalized,
                                    type: 'event',
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
                            (normalized as IChartEventItem & { type: 'event' }).name
                              ? `${(normalized as IChartEventItem & { type: 'event' }).name} (${alphabetIds[index]})`
                              : 'Display name'
                          }
                          defaultValue={(normalized as IChartEventItem & { type: 'event' }).displayName}
                          onChange={(e) => {
                            dispatchChangeEvent({
                              ...(normalized as IChartEventItem & { type: 'event' }),
                              displayName: e.target.value,
                            });
                          }}
                        />
                      )}
                      <ReportEventMore onClick={handleMore(normalized)} />
                    </>
                  )}
                </SortableEvent>
              );
            })}

            <div className="flex gap-2">
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
              {showFormula && (
                <Button
                  type="button"
                  variant="outline"
                  icon={PlusIcon}
                  onClick={() => {
                    dispatch(
                      addFormula({
                        type: 'formula',
                        formula: '',
                        displayName: '',
                      }),
                    );
                  }}
                >
                  Add Formula
                </Button>
              )}
            </div>
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
