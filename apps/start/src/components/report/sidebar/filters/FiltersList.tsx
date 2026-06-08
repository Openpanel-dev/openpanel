import type { IChartEvent } from '@openpanel/validation';

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
      <div className="bg-def-100 flex flex-col divide-y overflow-hidden rounded-b-md">
        {filters.map((filter) => {
          const isCohortFilter =
            filter.operator === 'inCohort' ||
            filter.operator === 'notInCohort';
          if (isCohortFilter) {
            return (
              <CohortFilterItem
                key={filter.id ?? filter.name}
                filter={filter}
                event={event}
              />
            );
          }
          return (
            <FilterItem
              key={filter.id ?? filter.name}
              filter={filter}
              event={event}
            />
          );
        })}
      </div>
    </div>
  );
}
