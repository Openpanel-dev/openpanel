import { Combobox } from '@/components/ui/combobox';
import { useAppParams } from '@/hooks/use-app-params';
import { useEventProperties } from '@/hooks/use-event-properties';
import { useDispatch, useSelector } from '@/redux';
import { api } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { DatabaseIcon } from 'lucide-react';

import type { IChartEvent } from '@openpanel/validation';

import { changeEvent } from '../reportSlice';

interface EventPropertiesComboboxProps {
  event: IChartEvent;
}

export function EventPropertiesCombobox({
  event,
}: EventPropertiesComboboxProps) {
  const dispatch = useDispatch();
  const { projectId } = useAppParams();
  const properties = useEventProperties(
    {
      event: event.name,
      projectId,
    },
    {
      enabled: !!event.name,
    },
  ).map((item) => ({
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
          }),
        );
      }}
    >
      <button
        type="button"
        className={cn(
          'flex items-center gap-1 rounded-md border border-border p-1 px-2 text-sm font-medium leading-none',
          !event.property && 'border-destructive text-destructive',
        )}
      >
        <DatabaseIcon size={12} />{' '}
        {event.property ? `Property: ${event.property}` : 'Select property'}
      </button>
    </Combobox>
  );
}
