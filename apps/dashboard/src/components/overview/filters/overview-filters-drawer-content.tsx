import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { ComboboxAdvanced } from '@/components/ui/combobox-advanced';
import { SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useEventNames } from '@/hooks/useEventNames';
import { useEventProperties } from '@/hooks/useEventProperties';
import {
  useEventQueryFilters,
  useEventQueryNamesFilter,
} from '@/hooks/useEventQueryFilters';
import { useEventValues } from '@/hooks/useEventValues';
import { useProfileProperties } from '@/hooks/useProfileProperties';
import { useProfileValues } from '@/hooks/useProfileValues';
import type {
  IChartEventFilter,
  IChartEventFilterOperator,
  IChartEventFilterValue,
} from '@openpanel/validation';
import { XIcon } from 'lucide-react';
import type { Options as NuqsOptions } from 'nuqs';

export interface OverviewFiltersDrawerContentProps {
  projectId: string;
  nuqsOptions?: NuqsOptions;
  enableEventsFilter?: boolean;
  mode: 'profiles' | 'events';
}

export function OverviewFiltersDrawerContent({
  projectId,
  nuqsOptions,
  enableEventsFilter,
  mode,
}: OverviewFiltersDrawerContentProps) {
  const [filters, setFilter] = useEventQueryFilters(nuqsOptions);
  const [event, setEvent] = useEventQueryNamesFilter(nuqsOptions);
  const eventNames = useEventNames(projectId);
  const eventProperties = useEventProperties(projectId);
  const profileProperties = useProfileProperties(projectId);
  const properties = mode === 'events' ? eventProperties : profileProperties;

  return (
    <div>
      <SheetHeader className="mb-8">
        <SheetTitle>Overview filters</SheetTitle>
      </SheetHeader>

      <div className="flex flex-col gap-4">
        {enableEventsFilter && (
          <ComboboxAdvanced
            className="w-full"
            value={event}
            onChange={setEvent}
            // First items is * which is only used for report editing
            items={eventNames.slice(1).map((item) => ({
              label: item.name,
              value: item.name,
            }))}
            placeholder="Select event"
          />
        )}
        <Combobox
          className="w-full"
          onChange={(value) => {
            setFilter(value, '');
          }}
          value=""
          placeholder="Filter by property"
          label="What do you want to filter by?"
          items={properties.map((item) => ({
            label: item,
            value: item,
          }))}
          searchable
        />
      </div>

      <div className="flex flex-col gap-4 mt-8">
        {filters
          .filter((filter) => filter.value[0] !== null)
          .map((filter) => {
            return mode === 'events' ? (
              <FilterOptionEvent
                key={filter.name}
                projectId={projectId}
                setFilter={setFilter}
                {...filter}
              />
            ) : (
              <FilterOptionProfile
                key={filter.name}
                projectId={projectId}
                setFilter={setFilter}
                {...filter}
              />
            );
          })}
      </div>
    </div>
  );
}

export function FilterOptionEvent({
  setFilter,
  projectId,
  ...filter
}: IChartEventFilter & {
  projectId: string;
  setFilter: (
    name: string,
    value: IChartEventFilterValue,
    operator: IChartEventFilterOperator
  ) => void;
}) {
  const values = useEventValues(
    projectId,
    filter.name === 'path' ? 'screen_view' : 'session_start',
    filter.name
  );

  return (
    <div className="flex gap-2 items-center">
      <div>{filter.name}</div>
      <Combobox
        className="flex-1"
        onChange={(value) => setFilter(filter.name, value, filter.operator)}
        placeholder={'Select a value'}
        items={values.map((value) => ({
          value,
          label: value,
        }))}
        value={String(filter.value[0] ?? '')}
      />
      <Button
        size="icon"
        variant="ghost"
        onClick={() =>
          setFilter(filter.name, filter.value[0] ?? '', filter.operator)
        }
      >
        <XIcon />
      </Button>
    </div>
  );
}

export function FilterOptionProfile({
  setFilter,
  projectId,
  ...filter
}: IChartEventFilter & {
  projectId: string;
  setFilter: (
    name: string,
    value: IChartEventFilterValue,
    operator: IChartEventFilterOperator
  ) => void;
}) {
  const values = useProfileValues(projectId, filter.name);

  return (
    <div className="flex gap-2 items-center">
      <div>{filter.name}</div>
      <Combobox
        className="flex-1"
        onChange={(value) => setFilter(filter.name, value, filter.operator)}
        placeholder={'Select a value'}
        items={values.map((value) => ({
          value,
          label: value,
        }))}
        value={String(filter.value[0] ?? '')}
      />
      <Button
        size="icon"
        variant="ghost"
        onClick={() =>
          setFilter(filter.name, filter.value[0] ?? '', filter.operator)
        }
      >
        <XIcon />
      </Button>
    </div>
  );
}
