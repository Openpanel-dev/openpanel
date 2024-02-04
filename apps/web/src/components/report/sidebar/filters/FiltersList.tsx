import type { IChartEvent } from '@/types';

import { FilterItem } from './FilterItem';

interface ReportEventFiltersProps {
  event: IChartEvent;
}

export function FiltersList({ event }: ReportEventFiltersProps) {
  return (
    <div>
      <div className="flex flex-col divide-y bg-slate-50">
        {event.filters.map((filter) => {
          return <FilterItem key={filter.name} filter={filter} event={event} />;
        })}
      </div>
    </div>
  );
}
