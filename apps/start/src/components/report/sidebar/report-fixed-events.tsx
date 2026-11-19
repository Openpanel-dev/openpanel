import type {
  IChartEvent,
  IChartEventItem,
  IChartFormula,
} from '@openpanel/core/modules/report/report.constants';
import { alphabetIds } from '@openpanel/core/modules/report/report.constants';
import {
  addSerie,
  changeEvent,
  duplicateEvent,
  removeEvent,
} from '../reportSlice';
import type { ReportEventMoreProps } from './ReportEventMore';
import { ReportEventMore } from './ReportEventMore';
import { ReportSeriesItem } from './ReportSeriesItem';
import { BuilderList, SidebarSection } from './sidebar-section';
import { ColorSquare } from '@/components/color-square';
import { ComboboxEvents } from '@/components/ui/combobox-events';
import { Input } from '@/components/ui/input';
import { useAppParams } from '@/hooks/use-app-params';
import { useDebounceFn } from '@/hooks/use-debounce-fn';
import { useEventNames } from '@/hooks/use-event-names';
import { useDispatch, useSelector } from '@/redux';

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
    <SidebarSection title="Metrics">
      <BuilderList>
        {Array.from({ length: numberOfEvents }, (_, index) => ({
          slotId: `fixed-event-slot-${index}`,
          index,
        })).map(({ slotId, index }) => {
          const event = selectedSeries[index];

          // If no event exists at this index, render an empty slot
          if (!event) {
            return (
              <div key={slotId}>
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <ColorSquare>
                    <span className="block">{alphabetIds[index]}</span>
                  </ColorSquare>
                  <ComboboxEvents
                    allowUnseenEvents
                    className="flex-1"
                    items={eventNames}
                    multiple={isSelectManyEvents as false}
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
                    variant="input"
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
              event={event}
              index={index}
              isSelectManyEvents={isSelectManyEvents}
              key={event.id}
              showAddFilter={showAddFilter}
              showSegment={showSegment}
            >
              <ComboboxEvents
                allowUnseenEvents
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
                variant="input"
              />
              {showDisplayNameInput && (
                <Input
                  className="w-36 shrink-0"
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
                  placeholder={
                    (event as IChartEventItem & { type: 'event' }).name
                      ? `${(event as IChartEventItem & { type: 'event' }).name} (${alphabetIds[index]})`
                      : 'Display name'
                  }
                />
              )}
              <ReportEventMore onClick={handleMore(event)} />
            </ReportSeriesItem>
          );
        })}
      </BuilderList>
    </SidebarSection>
  );
}
