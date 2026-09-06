import type { IChartEvent } from '@openpanel/core/modules/report/report.constants';
import { CohortFilterItem } from './CohortFilterItem';
import { FilterItem } from './FilterItem';

interface ReportEventFiltersProps {
  event: IChartEvent;
  /**
   * Skip the synthetic `name` filter (the event-name selector used by
   * multi-event series like retention) so only real property/cohort filters
   * are listed. Items still update the full event.filters by id.
   */
  skipNameFilter?: boolean;
}

export function FiltersList({
  event,
  skipNameFilter = false,
}: ReportEventFiltersProps) {
  const filters = skipNameFilter
    ? event.filters.filter((filter) => filter.name !== 'name')
    : event.filters;

  if (filters.length === 0) {
    return null;
  }

  return (
    <div>
      <div className="flex flex-col divide-y overflow-hidden rounded-b-md bg-def-100">
        {filters.map((filter) => {
          const isCohortFilter =
            filter.operator === 'inCohort' || filter.operator === 'notInCohort';
          if (isCohortFilter) {
            return (
              <CohortFilterItem
                event={event}
                filter={filter}
                key={filter.id ?? filter.name}
              />
            );
          }
          return (
            <FilterItem
              event={event}
              filter={filter}
              key={filter.id ?? filter.name}
            />
          );
        })}
      </div>
    </div>
  );
}
