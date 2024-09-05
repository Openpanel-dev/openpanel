import { Combobox } from '@/components/ui/combobox';
import { useAppParams } from '@/hooks/useAppParams';
import { useEventProperties } from '@/hooks/useEventProperties';
import { useDispatch, useSelector } from '@/redux';
import { FilterIcon } from 'lucide-react';

import { shortId } from '@openpanel/common';
import type { IChartEvent } from '@openpanel/validation';

import { changeEvent } from '../../reportSlice';

interface FiltersComboboxProps {
  event: IChartEvent;
}

export function FiltersCombobox({ event }: FiltersComboboxProps) {
  const dispatch = useDispatch();
  const interval = useSelector((state) => state.report.interval);
  const range = useSelector((state) => state.report.range);
  const startDate = useSelector((state) => state.report.startDate);
  const endDate = useSelector((state) => state.report.endDate);
  const { projectId } = useAppParams();

  const properties = useEventProperties(
    {
      event: event.name,
      projectId,
      range,
      interval,
      startDate,
      endDate,
    },
    {
      enabled: !!event.name,
    }
  );

  return (
    <Combobox
      searchable
      placeholder="Select a filter"
      value=""
      items={properties.map((item) => ({
        label: item,
        value: item,
      }))}
      onChange={(value) => {
        dispatch(
          changeEvent({
            ...event,
            filters: [
              ...event.filters,
              {
                id: shortId(),
                name: value,
                operator: 'is',
                value: [],
              },
            ],
          })
        );
      }}
    >
      <button className="flex items-center gap-1 rounded-md border border-border bg-card p-1 px-2 text-sm font-medium leading-none">
        <FilterIcon size={12} /> Add filter
      </button>
    </Combobox>
  );
}
