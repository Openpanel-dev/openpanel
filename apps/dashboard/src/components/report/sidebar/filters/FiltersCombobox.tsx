import { Combobox } from '@/components/ui/combobox';
import { useAppParams } from '@/hooks/useAppParams';
import { useDispatch, useSelector } from '@/redux';
import { api } from '@/trpc/client';
import { FilterIcon } from 'lucide-react';

import type { IChartEvent } from '@openpanel/validation';

import { changeEvent } from '../../reportSlice';

interface FiltersComboboxProps {
  event: IChartEvent;
}

export function FiltersCombobox({ event }: FiltersComboboxProps) {
  const dispatch = useDispatch();
  const { range, startDate, endDate } = useSelector((state) => state.report);
  const { projectId } = useAppParams();

  const query = api.chart.properties.useQuery(
    {
      event: event.name,
      projectId,
      range,
      startDate,
      endDate,
    },
    {
      enabled: !!event.name,
    }
  );

  const properties = (query.data ?? []).map((item) => ({
    label: item,
    value: item,
  }));

  return (
    <Combobox
      searchable
      placeholder="Select a filter"
      value=""
      items={properties}
      onChange={(value) => {
        dispatch(
          changeEvent({
            ...event,
            filters: [
              ...event.filters,
              {
                id: Math.random().toString(36).substring(7),
                name: value,
                operator: 'is',
                value: [],
              },
            ],
          })
        );
      }}
    >
      <button className="flex items-center gap-1 rounded-md border border-border bg-card p-1 px-2 text-xs font-medium leading-none">
        <FilterIcon size={12} /> Add filter
      </button>
    </Combobox>
  );
}
