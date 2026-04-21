import type { IChartEvent } from '@openpanel/validation';

import { CohortFilterItem } from './CohortFilterItem';
import { FilterItem } from './FilterItem';

interface ReportEventFiltersProps {
  event: IChartEvent;
}

export function FiltersList({ event }: ReportEventFiltersProps) {
  return (
    <div>
      <div className="bg-def-100 flex flex-col divide-y overflow-hidden rounded-b-md">
        {event.filters.map((filter) => {
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
