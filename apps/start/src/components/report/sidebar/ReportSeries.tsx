import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
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
import type {
  IChartEvent,
  IChartEventItem,
  IChartFormula,
} from '@openpanel/core/modules/report/report.constants';
import { alphabetIds } from '@openpanel/core/modules/report/report.constants';
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
import { ColorSquare } from '@/components/color-square';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ComboboxEvents } from '@/components/ui/combobox-events';
import { Input } from '@/components/ui/input';
import { InputEnter } from '@/components/ui/input-enter';
import { useAppParams } from '@/hooks/use-app-params';
import { useDebounceFn } from '@/hooks/use-debounce-fn';
import { useEventNames } from '@/hooks/use-event-names';
import { useDispatch, useSelector } from '@/redux';

// Matches a single uppercase letter that isn't part of a larger identifier,
// which is how mathjs treats series references in formulas (A, B, C, ...).
const ALPHA_REFERENCE_REGEX = /(?<![a-zA-Z0-9_])[A-Z](?![a-zA-Z0-9_])/g;

function getReferencedAlphaIds(
  formula: string,
  formulaIndex: number
): string[] {
  if (!formula) {
    return [];
  }
  const matches = formula.match(ALPHA_REFERENCE_REGEX) ?? [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const match of matches) {
    if (seen.has(match)) {
      continue;
    }
    const idx = alphabetIds.indexOf(match as (typeof alphabetIds)[number]);
    // Only include references to series that exist before this formula
    if (idx === -1 || idx >= formulaIndex) {
      continue;
    }
    seen.add(match);
    result.push(match);
  }
  return result;
}

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
        isSelectManyEvents={isSelectManyEvents}
        renderDragHandle={(index) => (
          <button className="cursor-grab active:cursor-grabbing" {...listeners}>
            <ColorSquare className="relative">
              <HandIcon className="absolute inset-1 size-3 scale-50 opacity-0 transition-all group-hover:scale-100 group-hover:opacity-100" />
              <span className="block transition-all group-hover:scale-0 group-hover:opacity-0">
                {alphabetIds[index]}
              </span>
            </ColorSquare>
          </button>
        )}
        showAddFilter={showAddFilter}
        showSegment={showSegment}
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
  // Retention supports property + cohort filters (hybrid cohort_events_mv /
  // raw-events engine), so the filter UI is enabled for it.
  const showAddFilter = !['sankey'].includes(chartType);
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
    })
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
            })
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
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        sensors={sensors}
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
                  className="rounded-lg border bg-def-100"
                  event={event}
                  index={index}
                  isSelectManyEvents={isSelectManyEvents}
                  key={event.id}
                  showAddFilter={showAddFilter}
                  showSegment={showSegment}
                >
                  {isFormula ? (
                    <>
                      <div className="flex flex-1 flex-col gap-2">
                        <InputEnter
                          onChangeValue={(value) => {
                            dispatchChangeFormula({
                              ...event,
                              formula: value,
                            });
                          }}
                          placeholder="eg: A+B"
                          value={event.formula}
                        />
                        {showDisplayNameInput && (
                          <Input
                            defaultValue={event.displayName}
                            onChange={(e) => {
                              dispatchChangeFormula({
                                ...event,
                                displayName: e.target.value,
                              });
                            }}
                            placeholder={`Name: Formula (${alphabetIds[index]})`}
                          />
                        )}
                        {(() => {
                          const referencedAlphaIds = getReferencedAlphaIds(
                            event.formula,
                            index
                          );
                          if (referencedAlphaIds.length === 0) {
                            return null;
                          }
                          const hideSeries = event.hideSeries ?? [];
                          return (
                            <div className="flex flex-wrap gap-x-3 gap-y-1.5 pt-1">
                              {referencedAlphaIds.map((alphaId) => {
                                const isHidden = hideSeries.includes(alphaId);
                                return (
                                  <label
                                    className="flex cursor-pointer select-none items-center gap-1.5 font-medium text-xs"
                                    key={alphaId}
                                  >
                                    <Checkbox
                                      checked={isHidden}
                                      onCheckedChange={(checked) => {
                                        const next = checked
                                          ? [
                                              ...hideSeries.filter(
                                                (id) => id !== alphaId
                                              ),
                                              alphaId,
                                            ]
                                          : hideSeries.filter(
                                              (id) => id !== alphaId
                                            );
                                        dispatch(
                                          changeEvent({
                                            ...event,
                                            hideSeries: next,
                                          })
                                        );
                                      }}
                                    />
                                    Hide series {alphaId} from chart
                                  </label>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                      <ReportEventMore onClick={handleMore(event)} />
                    </>
                  ) : (
                    <>
                      <ComboboxEvents
                        className="flex-1"
                        items={eventNames}
                        multiple={isSelectManyEvents as false}
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
                                        value,
                                      },
                                    ],
                                    name: '*',
                                  }
                                : {
                                    ...event,
                                    type: 'event',
                                    name: value,
                                    filters: [],
                                  }
                            )
                          );
                        }}
                        placeholder="Select event"
                        searchable
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
                      />
                      {showDisplayNameInput && (
                        <Input
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
                          placeholder={
                            (event as IChartEventItem & { type: 'event' }).name
                              ? `${(event as IChartEventItem & { type: 'event' }).name} (${alphabetIds[index]})`
                              : 'Display name'
                          }
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
                items={eventNames}
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
                      })
                    );
                  } else {
                    dispatch(
                      addSerie({
                        type: 'event',
                        name: value,
                        segment: 'event',
                        filters: [],
                      })
                    );
                  }
                }}
                placeholder="Select event"
                searchable
                value={''}
              />
              {showFormula && (
                <Button
                  className="flex-1 justify-start px-4 text-left"
                  icon={PiIcon}
                  onClick={() => {
                    dispatch(
                      addSerie({
                        type: 'formula',
                        formula: '',
                        displayName: '',
                      })
                    );
                  }}
                  type="button"
                  variant="outline"
                >
                  Add Formula
                  <PlusIcon className="ml-auto size-4 text-muted-foreground" />
                </Button>
              )}
            </div>
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
