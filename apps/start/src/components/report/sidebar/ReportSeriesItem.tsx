import type {
  IChartEvent,
  IChartEventItem,
} from '@openpanel/core/modules/report/report.constants';
import { alphabetIds } from '@openpanel/core/modules/report/report.constants';
import { shortId } from '@openpanel/shared';
import { DatabaseIcon, FilterIcon, HistoryIcon } from 'lucide-react';
import { ReportSegment } from '../ReportSegment';
import { changeEvent } from '../reportSlice';
import { FiltersList } from './filters/FiltersList';
import { PropertiesCombobox } from './PropertiesCombobox';
import { BuilderChip } from './sidebar-section';
import { ColorSquare } from '@/components/color-square';
import { useDispatch } from '@/redux';

const ANY_EVENT = '*';

export interface ReportSeriesItemProps
  extends React.HTMLAttributes<HTMLDivElement> {
  event: IChartEventItem | IChartEvent;
  index: number;
  showSegment: boolean;
  showAddFilter: boolean;
  /** Offer the "first time" qualifier; the chart type has to support it. */
  showFirstTime?: boolean;
  isSelectManyEvents: boolean;
  renderDragHandle?: (index: number) => React.ReactNode;
}

export function ReportSeriesItem({
  event,
  index,
  showSegment,
  showAddFilter,
  showFirstTime = false,
  isSelectManyEvents,
  renderDragHandle,
  ...props
}: ReportSeriesItemProps) {
  const dispatch = useDispatch();

  // Normalize event to have type field
  const normalizedEvent: IChartEventItem =
    'type' in event ? event : { ...event, type: 'event' as const };

  const isFormula = normalizedEvent.type === 'formula';
  const chartEvent = isFormula
    ? null
    : (normalizedEvent as IChartEventItem & { type: 'event' });
  // The any-event series has no single event to take a first occurrence of.
  const canCountFirstTime = showFirstTime && chartEvent?.name !== ANY_EVENT;

  return (
    <div {...props}>
      <div className="group flex items-center gap-2 px-3 py-2.5">
        {renderDragHandle ? (
          renderDragHandle(index)
        ) : (
          <ColorSquare>
            <span className="block">{alphabetIds[index]}</span>
          </ColorSquare>
        )}
        {props.children}
      </div>

      {/* Segment, first time and filter buttons - only for events */}
      {chartEvent && (showSegment || showAddFilter || canCountFirstTime) && (
        <div className="flex flex-wrap gap-1 px-3 pb-2.5 pl-10">
          {showSegment && (
            <ReportSegment
              className="h-7 px-2 text-muted-foreground text-xs hover:text-foreground"
              onChange={(segment) => {
                dispatch(
                  changeEvent({
                    ...chartEvent,
                    segment,
                  })
                );
              }}
              size="sm"
              value={chartEvent.segment}
              variant="ghost"
            />
          )}
          {canCountFirstTime && (
            <BuilderChip
              aria-pressed={chartEvent.firstTime === true}
              className={
                chartEvent.firstTime
                  ? 'bg-def-200 text-foreground dark:bg-def-300'
                  : undefined
              }
              icon={HistoryIcon}
              onClick={() => {
                dispatch(
                  changeEvent({
                    ...chartEvent,
                    firstTime: !chartEvent.firstTime,
                  })
                );
              }}
              title="Count only each user's first-ever occurrence of this event"
            >
              First time
            </BuilderChip>
          )}
          {showAddFilter && (
            <PropertiesCombobox
              categories={['event', 'profile', 'group', 'cohort']}
              event={chartEvent}
              onSelect={(action) => {
                const isCohortAction = action.value === 'cohort';
                if (
                  isCohortAction &&
                  chartEvent.filters.some(
                    (f) =>
                      f.operator === 'inCohort' || f.operator === 'notInCohort'
                  )
                ) {
                  return;
                }
                dispatch(
                  changeEvent({
                    ...chartEvent,
                    filters: [
                      ...chartEvent.filters,
                      isCohortAction
                        ? {
                            id: shortId(),
                            name: 'cohort',
                            operator: 'inCohort',
                            value: [],
                            cohortIds: [],
                          }
                        : {
                            id: shortId(),
                            name: action.value,
                            operator: 'is',
                            value: [],
                            type: 'string',
                          },
                    ],
                  })
                );
              }}
            >
              {(setOpen) => (
                <BuilderChip
                  icon={FilterIcon}
                  onClick={() => setOpen((p) => !p)}
                >
                  Add filter
                </BuilderChip>
              )}
            </PropertiesCombobox>
          )}

          {showSegment && chartEvent.segment.startsWith('property_') && (
            <PropertiesCombobox
              event={chartEvent}
              include={chartEvent.name === 'session_end' ? ['duration'] : []}
              onSelect={(item) => {
                dispatch(
                  changeEvent({
                    ...chartEvent,
                    property: item.value,
                    type: 'event',
                  })
                );
              }}
            >
              {(setOpen) => (
                <BuilderChip
                  icon={DatabaseIcon}
                  onClick={() => setOpen((p) => !p)}
                >
                  {chartEvent.property
                    ? `Property: ${chartEvent.property}`
                    : 'Select property'}
                </BuilderChip>
              )}
            </PropertiesCombobox>
          )}
        </div>
      )}

      {/* Filters list. For multi-event series (retention) the first filter is
          the event-name selector, so hide it and show only added filters. */}
      {chartEvent && (
        <FiltersList event={chartEvent} skipNameFilter={isSelectManyEvents} />
      )}
    </div>
  );
}
