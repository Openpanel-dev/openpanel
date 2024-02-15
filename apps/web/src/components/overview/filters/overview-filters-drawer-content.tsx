'use client';

import { api } from '@/app/_trpc/client';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { useEventQueryFilters } from '@/hooks/useEventQueryFilters';
import { XIcon } from 'lucide-react';

interface OverviewFiltersProps {
  projectId: string;
}

export function OverviewFiltersDrawerContent({
  projectId,
}: OverviewFiltersProps) {
  const eventQueryFilters = useEventQueryFilters();

  return (
    <div>
      <h2 className="text-xl font-medium mb-8">Overview filters</h2>
      <Combobox
        className="w-full"
        onChange={(value) => {
          // @ts-expect-error
          eventQueryFilters[value].set('');
        }}
        value=""
        placeholder="Filter by..."
        label="What do you want to filter by?"
        items={Object.entries(eventQueryFilters)
          .filter(([, filter]) => filter.get === null)
          .map(([name]) => ({
            label: name,
            value: name,
          }))}
        searchable
      />

      <div className="flex flex-col gap-4 mt-8">
        {Object.entries(eventQueryFilters)
          .filter(([, filter]) => filter.get !== null)
          .map(([name, filter]) => (
            <FilterOption
              key={name}
              projectId={projectId}
              name={name}
              {...filter}
            />
          ))}
      </div>
    </div>
  );
}

export function FilterOption({
  name,
  get,
  set,
  projectId,
}: {
  name: string;
  get: string | null;
  set: (value: string | null) => void;
  projectId: string;
}) {
  const { data } = api.chart.values.useQuery({
    projectId,
    event: name === 'path' ? 'screen_view' : 'session_start',
    property: name,
  });

  return (
    <div className="flex gap-2 items-center">
      <div>{name}</div>
      <Combobox
        className="flex-1"
        onChange={(value) => set(value)}
        placeholder={'Select a value'}
        items={
          data?.values.filter(Boolean).map((value) => ({
            value,
            label: value,
          })) ?? []
        }
        value={get}
      />
      <Button size="icon" variant="ghost" onClick={() => set(null)}>
        <XIcon />
      </Button>
    </div>
  );
}
