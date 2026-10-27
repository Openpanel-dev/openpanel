import type {
  IChartEvent,
  IChartEventItem,
} from '@openpanel/core/modules/report/report.constants';
import { alphabetIds } from '@openpanel/core/modules/report/report.constants';
import { shortId } from '@openpanel/shared';
import { DatabaseIcon, FilterIcon } from 'lucide-react';
import { ReportSegment } from '../ReportSegment';
import { ReportPerUser } from '../report-per-user';
import { changeEvent } from '../reportSlice';
import { FiltersList } from './filters/FiltersList';
import { PropertiesCombobox } from './PropertiesCombobox';
import { BuilderChip } from './sidebar-section';
import { ColorSquare } from '@/components/color-square';
import { useDispatch } from '@/redux';

export interface ReportSeriesItemProps
  extends React.HTMLAttributes<HTMLDivElement> {
  event: IChartEventItem | IChartEvent;
  index: number;
  showSegment: boolean;
  showAddFilter: boolean;
  /** Distribution charts pick a per-user value instead of a segment. */
  showPerUser?: boolean;
  isSelectManyEvents: boolean;
  renderDragHandle?: (index: number) => React.ReactNode;
}

export function ReportSeriesItem({
  event,
  index,
  showSegment,
  showAddFilter,
  showPerUser = false,
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
  const perUserAggregation = chartEvent?.perUser?.aggregation ?? 'count';

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

      {/* Segment and Filter buttons - only for events */}
      {chartEvent && (showSegment || showAddFilter || showPerUser) && (
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
          {showPerUser && (
            <ReportPerUser
              className="h-7 px-2 text-muted-foreground text-xs hover:text-foreground"
              onChange={(aggregation) => {
                dispatch(
                  changeEvent({
                    ...chartEvent,
                    perUser: {
                      aggregation,
                      property:
                        aggregation === 'count'
                          ? undefined
                          : chartEvent.perUser?.property,
                    },
                  })
                );
              }}
              size="sm"
              value={perUserAggregation}
              variant="ghost"
            />
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
          {showPerUser && perUserAggregation !== 'count' && (
            <PropertiesCombobox
              // A profile property has one value per user: nothing to aggregate.
              categories={['event']}
              event={chartEvent}
              include={chartEvent.name === 'session_end' ? ['duration'] : []}
              onSelect={(item) => {
                dispatch(
                  changeEvent({
                    ...chartEvent,
                    perUser: {
                      aggregation: perUserAggregation,
                      property: item.value,
                    },
                  })
                );
              }}
            >
              {(setOpen) => (
                <BuilderChip
                  icon={DatabaseIcon}
                  onClick={() => setOpen((p) => !p)}
                >
                  {chartEvent.perUser?.property
                    ? `Property: ${chartEvent.perUser.property}`
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
