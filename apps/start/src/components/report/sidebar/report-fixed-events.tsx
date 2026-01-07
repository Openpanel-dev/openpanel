import { ColorSquare } from '@/components/color-square';
import { ComboboxEvents } from '@/components/ui/combobox-events';
import { Input } from '@/components/ui/input';
import { InputEnter } from '@/components/ui/input-enter';
import { useAppParams } from '@/hooks/use-app-params';
import { useDebounceFn } from '@/hooks/use-debounce-fn';
import { useEventNames } from '@/hooks/use-event-names';
import { useDispatch, useSelector } from '@/redux';
import { alphabetIds } from '@openpanel/constants';
import type {
  IChartEvent,
  IChartEventItem,
  IChartFormula,
} from '@openpanel/validation';
import {
  addSerie,
  changeEvent,
  duplicateEvent,
  removeEvent,
} from '../reportSlice';
import type { ReportEventMoreProps } from './ReportEventMore';
import { ReportEventMore } from './ReportEventMore';
import { ReportSeriesItem } from './ReportSeriesItem';

export function ReportFixedEvents({
  numberOfEvents,
}: {
  numberOfEvents: number;
}) {
  const selectedSeries = useSelector((state) => state.report.series);
  const chartType = useSelector((state) => state.report.chartType);
  const dispatch = useDispatch();
  const { projectId } = useAppParams();
  const eventNames = useEventNames({
    projectId,
  });

  const showSegment = !['retention', 'funnel', 'sankey'].includes(chartType);
  const showAddFilter = !['retention'].includes(chartType);
  const showDisplayNameInput = !['retention', 'sankey'].includes(chartType);
  const dispatchChangeEvent = useDebounceFn((event: IChartEventItem) => {
    dispatch(changeEvent(event));
  });
  const isSelectManyEvents = chartType === 'retention';

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
      <div className="flex flex-col gap-4">
        {Array.from({ length: numberOfEvents }, (_, index) => ({
          slotId: `fixed-event-slot-${index}`,
          index,
        })).map(({ slotId, index }) => {
          const event = selectedSeries[index];

          // If no event exists at this index, render an empty slot
          if (!event) {
            return (
              <div key={slotId} className="rounded-lg border bg-def-100">
                <div className="flex items-center gap-2 p-2">
                  <ColorSquare>
                    <span className="block">{alphabetIds[index]}</span>
                  </ColorSquare>
                  <ComboboxEvents
                    className="flex-1"
                    searchable
                    multiple={isSelectManyEvents as false}
                    value={''}
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
                    items={eventNames}
                    placeholder="Select event"
                  />
                </div>
              </div>
            );
          }

          const isFormula = event.type === 'formula';
          if (isFormula) {
            return null;
          }

          return (
            <ReportSeriesItem
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
                    (event as IChartEventItem & { type: 'event' }).displayName
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
            </ReportSeriesItem>
          );
        })}
      </div>
    </div>
  );
}
