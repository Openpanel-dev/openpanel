import { PureFilterItem } from '@/components/report/sidebar/filters/FilterItem';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { SheetContent } from '@/components/ui/sheet';
import { useEventNames } from '@/hooks/use-event-names';
import {
  useEventQueryFilters,
  useEventQueryNamesFilter,
} from '@/hooks/use-event-query-filters';
import { useProfileValues } from '@/hooks/use-profile-values';
import { FilterIcon, GanttChartIcon, GlobeIcon, LucideIcon, SlidersHorizontal, XIcon } from 'lucide-react';
import type { Options as NuqsOptions } from 'nuqs';

import type {
  IChartEventFilter,
  IChartEventFilterOperator,
  IChartEventFilterValue,
} from '@openpanel/validation';

import { OriginFilter } from '@/components/overview/filters/origin-filter';
import { PropertiesCombobox } from '@/components/report/sidebar/PropertiesCombobox';
import { ComboboxEvents } from '@/components/ui/combobox-events';
import { useAppParams } from '@/hooks/use-app-params';
import { cn } from '@/utils/cn';
import { ModalHeader } from './Modal/Container';

export interface OverviewFiltersProps {
  nuqsOptions?: NuqsOptions;
  enableEventsFilter?: boolean;
  mode?: 'events' | 'profile';
}

const Seperator = () => <div className="h-px bg-border -mx-6" />
const Heading = ({ title, icon: Icon }: { title: string, icon: LucideIcon }) => (
  <div className="row items-center gap-2">
    <Icon className="size-4" />
    <h2 className="text-sm font-medium">
      {title}
    </h2>
  </div>
);

export default function OverviewFilters({
  nuqsOptions,
  enableEventsFilter,
  mode,
}: OverviewFiltersProps) {
  const { projectId } = useAppParams();
  const [filters, setFilter] = useEventQueryFilters(nuqsOptions);
  const [event, setEvent] = useEventQueryNamesFilter(nuqsOptions);
  const eventNames = useEventNames({ projectId, anyEvents: false });
  const selectedFilters = filters.filter((filter) => filter.value[0] !== null);
  return (
    <SheetContent className="[&>button.absolute]:hidden">
      <ModalHeader title="Filters" />
      <div className="flex flex-col gap-4">
        <Heading icon={GlobeIcon} title="Origins" />
        <OriginFilter />
        <Seperator />
        {enableEventsFilter && (
          <>
        <Heading icon={GanttChartIcon} title="Events" />
          <ComboboxEvents
            size="lg"
            className="w-full"
            value={event}
            onChange={setEvent}
            multiple
            items={eventNames}
            placeholder="Select event"
            maxDisplayItems={2}
            searchable
            />
            <Seperator />
          </>
        )}
      </div>
        <Heading icon={SlidersHorizontal} title="Filters" />
      <div className="flex flex-col gap-2">
        <div
          className={cn(
            'bg-card rounded-lg border',
          )}
        >
          {selectedFilters.length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No filters selected
            </div>
          )}
          {selectedFilters.map((filter) => {
            return (
              <PureFilterItem
                className="border-t p-4 first:border-0"
                eventName="screen_view"
                key={filter.name}
                filter={filter}
                onRemove={() => {
                  setFilter(filter.name, [], filter.operator);
                }}
                onChangeValue={(value) => {
                  setFilter(filter.name, value, filter.operator);
                }}
                onChangeOperator={(operator) => {
                  setFilter(filter.name, filter.value, operator);
                }}
              />
            );
          })}
        </div>
        <PropertiesCombobox
          mode={mode}
          exclude={
            enableEventsFilter
              ? []
              : [
                  'properties.*',
                  'name',
                  'duration',
                  'created_at',
                  'has_profile',
                ]
          }
          onSelect={(action) => {
            setFilter(action.value, [], 'is');
          }}
        >
          {(setOpen) => (
            <Button
              onClick={() => setOpen((p) => !p)}
              variant="outline"
              size="lg"
              className="w-full"
              icon={FilterIcon}
            >
              Add filter
            </Button>
          )}
        </PropertiesCombobox>
      </div>
    </SheetContent>
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
