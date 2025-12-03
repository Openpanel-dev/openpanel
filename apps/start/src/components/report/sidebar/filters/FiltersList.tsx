import type { IChartEvent } from '@openpanel/validation';

import { FilterItem } from './FilterItem';

interface ReportEventFiltersProps {
  event: IChartEvent;
}

export function FiltersList({ event }: ReportEventFiltersProps) {
  return (
    <div>
      <div className="bg-def-100 flex flex-col divide-y overflow-hidden rounded-b-md">
        {event.filters.map((filter) => {
          return <FilterItem key={filter.name} filter={filter} event={event} />;
        })}
      </div>
    </div>
  );
}
