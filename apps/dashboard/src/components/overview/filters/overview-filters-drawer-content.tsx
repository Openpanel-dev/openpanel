import { PureFilterItem } from '@/components/report/sidebar/filters/FilterItem';
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
import { useProfileProperties } from '@/hooks/useProfileProperties';
import { useProfileValues } from '@/hooks/useProfileValues';
import { usePropertyValues } from '@/hooks/usePropertyValues';
import { XIcon } from 'lucide-react';
import type { Options as NuqsOptions } from 'nuqs';

import type {
  IChartEventFilter,
  IChartEventFilterOperator,
  IChartEventFilterValue,
} from '@openpanel/validation';

import { useOverviewOptions } from '../useOverviewOptions';
import { OriginFilter } from './origin-filter';

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
  const { interval, range, startDate, endDate } = useOverviewOptions();
  const [filters, setFilter] = useEventQueryFilters(nuqsOptions);
  const [event, setEvent] = useEventQueryNamesFilter(nuqsOptions);
  const eventNames = useEventNames({ projectId, interval, range });
  const eventProperties = useEventProperties({ projectId, interval, range });
  const profileProperties = useProfileProperties(projectId);
  const properties = mode === 'events' ? eventProperties : profileProperties;

  return (
    <div>
      <SheetHeader className="mb-8">
        <SheetTitle>Overview filters</SheetTitle>
      </SheetHeader>

      <div className="mt-8 flex flex-col rounded-md border bg-def-100">
        <div className="flex flex-col gap-4 p-4">
          <OriginFilter />
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
              setFilter(value, [], 'is');
            }}
            value=""
            placeholder="Filter by property"
            label="What do you want to filter by?"
            items={properties
              .filter((item) => item !== 'name')
              .map((item) => ({
                label: item,
                value: item,
              }))}
            searchable
            size="lg"
          />
        </div>
        {filters
          .filter((filter) => filter.value[0] !== null)
          .map((filter) => {
            return mode === 'events' ? (
              <PureFilterItem
                className="border-t p-4 first:border-0"
                eventName="screen_view"
                key={filter.name}
                filter={filter}
                range={range}
                interval={interval}
                onRemove={() => {
                  setFilter(filter.name, [], filter.operator);
                }}
                onChangeValue={(value) => {
                  setFilter(filter.name, value, filter.operator);
                }}
                onChangeOperator={(operator) => {
                  setFilter(filter.name, filter.value, operator);
                }}
                startDate={startDate}
                endDate={endDate}
              />
            ) : /* TODO: Implement profile filters */
            null;
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
    operator: IChartEventFilterOperator,
  ) => void;
}) {
  const { interval, range } = useOverviewOptions();
  const values = usePropertyValues({
    projectId,
    event: filter.name === 'path' ? 'screen_view' : 'session_start',
    property: filter.name,
    interval,
    range,
  });

  return (
    <div className="flex items-center gap-2">
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
    operator: IChartEventFilterOperator,
  ) => void;
}) {
  const values = useProfileValues(projectId, filter.name);

  return (
    <div className="flex items-center gap-2">
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
