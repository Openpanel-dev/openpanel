import { api } from '@/app/_trpc/client';
import { Combobox } from '@/components/ui/combobox';
import { useAppParams } from '@/hooks/useAppParams';
import { useDispatch } from '@/redux';
import { cn } from '@/utils/cn';
import { DatabaseIcon } from 'lucide-react';

import type { IChartEvent } from '@mixan/validation';

import { changeEvent } from '../reportSlice';

interface EventPropertiesComboboxProps {
  event: IChartEvent;
}

export function EventPropertiesCombobox({
  event,
}: EventPropertiesComboboxProps) {
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
            property: value,
          })
        );
      }}
    >
      <button
        className={cn(
          'flex items-center gap-1 rounded-md border border-border p-1 px-2 font-medium leading-none text-xs',
          !event.property && 'border-destructive text-destructive'
        )}
      >
        <DatabaseIcon size={12} />{' '}
        {event.property ? `Property: ${event.property}` : 'Select property'}
      </button>
    </Combobox>
  );
}
