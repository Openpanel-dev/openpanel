import type {
  IChartEvent,
  IChartEventItem,
} from '@openpanel/core/modules/report/report.constants';
import { alphabetIds } from '@openpanel/core/modules/report/report.constants';
import { shortId } from '@openpanel/shared';
import { DatabaseIcon, FilterIcon, type LucideIcon } from 'lucide-react';
import { ReportSegment } from '../ReportSegment';
import { changeEvent } from '../reportSlice';
import { FiltersList } from './filters/FiltersList';
import { PropertiesCombobox } from './PropertiesCombobox';
import { ColorSquare } from '@/components/color-square';
import { useDispatch } from '@/redux';

export interface ReportSeriesItemProps
  extends React.HTMLAttributes<HTMLDivElement> {
  event: IChartEventItem | IChartEvent;
  index: number;
  showSegment: boolean;
  showAddFilter: boolean;
  isSelectManyEvents: boolean;
  renderDragHandle?: (index: number) => React.ReactNode;
}

export function ReportSeriesItem({
  event,
  index,
  showSegment,
  showAddFilter,
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

  return (
    <div {...props}>
      <div className="group flex items-center gap-2 p-2">
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
      {chartEvent && (showSegment || showAddFilter) && (
        <div className="flex gap-2 p-2 pt-0">
          {showSegment && (
            <ReportSegment
              onChange={(segment) => {
                dispatch(
                  changeEvent({
                    ...chartEvent,
                    segment,
                  })
                );
              }}
              value={chartEvent.segment}
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
                <SmallButton
                  icon={FilterIcon}
                  onClick={() => setOpen((p) => !p)}
                >
                  Add filter
                </SmallButton>
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
                <SmallButton
                  icon={DatabaseIcon}
                  onClick={() => setOpen((p) => !p)}
                >
                  {chartEvent.property
                    ? `Property: ${chartEvent.property}`
                    : 'Select property'}
                </SmallButton>
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

function SmallButton({
  children,
  icon: Icon,
  ...props
}: {
  children: React.ReactNode;
  icon: LucideIcon;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className="flex min-w-0 items-center gap-1 rounded-md border border-border bg-card p-1 px-2 text-left font-medium text-sm leading-none"
      type="button"
      {...props}
    >
      <Icon className="shrink-0" size={12} />
      <span className="truncate">{children}</span>
    </button>
  );
}
