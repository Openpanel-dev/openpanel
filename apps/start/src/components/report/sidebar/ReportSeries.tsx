import { ColorSquare } from '@/components/color-square';
import { Button } from '@/components/ui/button';
import { ComboboxEvents } from '@/components/ui/combobox-events';
import { Input } from '@/components/ui/input';
import { InputEnter } from '@/components/ui/input-enter';
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
import { alphabetIds } from '@openpanel/constants';
import type {
  IChartEvent,
  IChartEventItem,
  IChartFormula,
} from '@openpanel/validation';
import { HandIcon, PiIcon, PlusIcon } from 'lucide-react';
import {
  addSerie,
  changeEvent,
  duplicateEvent,
  removeEvent,
  reorderEvents,
} from '../reportSlice';
import type { ReportEventMoreProps } from './ReportEventMore';
import { ReportEventMore } from './ReportEventMore';
import {
  ReportSeriesItem,
  type ReportSeriesItemProps,
} from './ReportSeriesItem';

function SortableReportSeriesItem({
  event,
  index,
  showSegment,
  showAddFilter,
  isSelectManyEvents,
  ...props
}: Omit<ReportSeriesItemProps, 'renderDragHandle'>) {
  const eventId = 'type' in event ? event.id : (event as IChartEvent).id;
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: eventId ?? '' });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <ReportSeriesItem
        event={event}
        index={index}
        showSegment={showSegment}
        showAddFilter={showAddFilter}
        isSelectManyEvents={isSelectManyEvents}
        renderDragHandle={(index) => (
          <button className="cursor-grab active:cursor-grabbing" {...listeners}>
            <ColorSquare className="relative">
              <HandIcon className="size-3 opacity-0 scale-50 group-hover:opacity-100 group-hover:scale-100 transition-all absolute inset-1" />
              <span className="block group-hover:opacity-0 group-hover:scale-0 transition-all">
                {alphabetIds[index]}
              </span>
            </ColorSquare>
          </button>
        )}
        {...props}
      />
    </div>
  );
}

export function ReportSeries() {
  const selectedSeries = useSelector((state) => state.report.series);
  const chartType = useSelector((state) => state.report.chartType);
  const dispatch = useDispatch();
  const { projectId } = useAppParams();
  const eventNames = useEventNames({
    projectId,
  });

  const showSegment = !['retention', 'funnel', 'sankey'].includes(chartType);
  const showAddFilter = !['retention', 'sankey'].includes(chartType);
  const showDisplayNameInput = !['retention', 'sankey'].includes(chartType);
  const options = useSelector((state) => state.report.options);
  const isSankey = chartType === 'sankey';
  const isAddEventDisabled =
    (chartType === 'retention' || chartType === 'conversion') &&
    selectedSeries.length >= 2;
  const isSankeyEventLimitReached =
    isSankey &&
    options &&
    ((options.type === 'sankey' &&
      options.mode === 'between' &&
      selectedSeries.length >= 2) ||
      (options.type === 'sankey' &&
        options.mode !== 'between' &&
        selectedSeries.length >= 1));
  const dispatchChangeEvent = useDebounceFn((event: IChartEventItem) => {
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
      const oldIndex = selectedSeries.findIndex((e) => e.id === active.id);
      const newIndex = selectedSeries.findIndex((e) => e.id === over.id);

      dispatch(reorderEvents({ fromIndex: oldIndex, toIndex: newIndex }));
    }
  };

  const handleMore = (event: IChartEventItem | IChartEvent) => {
    const callback: ReportEventMoreProps['onClick'] = (action) => {
      switch (action) {
        case 'remove': {
          return dispatch(
            removeEvent({
              id: 'type' in event ? event.id : (event as IChartEvent).id,
            }),
          );
        }
        case 'duplicate': {
          const normalized =
            'type' in event ? event : { ...event, type: 'event' as const };
          return dispatch(duplicateEvent(normalized));
        }
      }
    };

    return callback;
  };

  const dispatchChangeFormula = useDebounceFn((formula: IChartFormula) => {
    dispatch(changeEvent(formula));
  });

  const showFormula =
    chartType !== 'conversion' &&
    chartType !== 'funnel' &&
    chartType !== 'retention' &&
    chartType !== 'sankey';

  return (
    <div>
      <h3 className="mb-2 font-medium">Metrics</h3>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={selectedSeries.map((e) => ({
            id: ('type' in e ? e.id : (e as IChartEvent).id) ?? '',
          }))}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-4">
            {selectedSeries.map((event, index) => {
              const isFormula = event.type === 'formula';

              return (
                <SortableReportSeriesItem
                  key={event.id}
                  event={event}
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
                          placeholder="eg: A+B"
                          value={event.formula}
                          onChangeValue={(value) => {
                            dispatchChangeFormula({
                              ...event,
                              formula: value,
                            });
                          }}
                        />
                        {showDisplayNameInput && (
                          <Input
                            placeholder={`Name: Formula (${alphabetIds[index]})`}
                            defaultValue={event.displayName}
                            onChange={(e) => {
                              dispatchChangeFormula({
                                ...event,
                                displayName: e.target.value,
                              });
                            }}
                          />
                        )}
                      </div>
                      <ReportEventMore onClick={handleMore(event)} />
                    </>
                  ) : (
                    <>
                      <ComboboxEvents
                        className="flex-1"
                        searchable
                        multiple={isSelectManyEvents as false}
                        value={
                          (isSelectManyEvents
                            ? ((
                                event as IChartEventItem & {
                                  type: 'event';
                                }
                              ).filters[0]?.value ?? [])
                            : (
                                event as IChartEventItem & {
                                  type: 'event';
                                }
                              ).name) as any
                        }
                        onChange={(value) => {
                          dispatch(
                            changeEvent(
                              Array.isArray(value)
                                ? {
                                    id: event.id,
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
                                    ...event,
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
                            (event as IChartEventItem & { type: 'event' }).name
                              ? `${(event as IChartEventItem & { type: 'event' }).name} (${alphabetIds[index]})`
                              : 'Display name'
                          }
                          defaultValue={
                            (event as IChartEventItem & { type: 'event' })
                              .displayName
                          }
                          onChange={(e) => {
                            dispatchChangeEvent({
                              ...(event as IChartEventItem & {
                                type: 'event';
                              }),
                              displayName: e.target.value,
                            });
                          }}
                        />
                      )}
                      <ReportEventMore onClick={handleMore(event)} />
                    </>
                  )}
                </SortableReportSeriesItem>
              );
            })}

            <div className="flex gap-2">
              <ComboboxEvents
                className="flex-1"
                disabled={isAddEventDisabled || isSankeyEventLimitReached}
                value={''}
                searchable
                onChange={(value) => {
                  if (isSelectManyEvents) {
                    dispatch(
                      addSerie({
                        type: 'event',
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
                      addSerie({
                        type: 'event',
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
                  icon={PiIcon}
                  className="flex-1 justify-start text-left px-4"
                  onClick={() => {
                    dispatch(
                      addSerie({
                        type: 'formula',
                        formula: '',
                        displayName: '',
                      }),
                    );
                  }}
                >
                  Add Formula
                  <PlusIcon className="size-4 ml-auto text-muted-foreground" />
                </Button>
              )}
            </div>
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
