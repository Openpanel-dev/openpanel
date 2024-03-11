import { api } from '@/app/_trpc/client';
import { Combobox } from '@/components/ui/combobox';
import { useAppParams } from '@/hooks/useAppParams';
import { useDispatch } from '@/redux';
import { FilterIcon } from 'lucide-react';

import type { IChartEvent } from '@mixan/validation';

import { changeEvent } from '../../reportSlice';

interface FiltersComboboxProps {
  event: IChartEvent;
}

export function FiltersCombobox({ event }: FiltersComboboxProps) {
  const dispatch = useDispatch();
  const { projectId } = useAppParams();

  const query = api.chart.properties.useQuery(
    {
      event: event.name,
      projectId,
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
                id: (event.filters.length + 1).toString(),
                name: value,
                operator: 'is',
                value: [],
              },
            ],
          })
        );
      }}
    >
      <button className="flex items-center gap-1 rounded-md border border-border p-1 px-2 font-medium leading-none text-xs bg-white">
        <FilterIcon size={12} /> Add filter
      </button>
    </Combobox>
  );
}
