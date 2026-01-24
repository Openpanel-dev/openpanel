import type { IChartEvent } from '@openpanel/validation';

import { FilterItem } from './FilterItem';
import { CohortFilterItem } from './CohortFilterItem';

interface ReportEventFiltersProps {
  event: IChartEvent;
}

export function FiltersList({ event }: ReportEventFiltersProps) {
  return (
    <div>
      <div className="bg-def-100 flex flex-col divide-y overflow-hidden rounded-b-md">
        {event.filters.map((filter) => {
          // Use CohortFilterItem for cohort filters
          const isCohortFilter =
            filter.operator === 'inCohort' || filter.operator === 'notInCohort';

          if (isCohortFilter) {
            return (
              <CohortFilterItem key={filter.id} filter={filter} event={event} />
            );
          }

          return <FilterItem key={filter.id} filter={filter} event={event} />;
        })}
      </div>
    </div>
  );
}
