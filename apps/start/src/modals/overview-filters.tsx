import type {
  IChartEventFilter,
  IChartEventFilterOperator,
  IChartEventFilterValue,
} from '@openpanel/core/modules/report/report.constants';
import {
  FilterIcon,
  GanttChartIcon,
  GlobeIcon,
  type LucideIcon,
  SlidersHorizontal,
  SparklesIcon,
  XIcon,
} from 'lucide-react';
import type { Options as NuqsOptions } from 'nuqs';
import { ModalHeader } from './Modal/Container';
import { OriginFilter } from '@/components/overview/filters/origin-filter';
import { OverviewAICommand } from '@/components/overview/overview-ai-command';
import { PureCohortFilterItem } from '@/components/report/sidebar/filters/CohortFilterItem';
import { PureFilterItem } from '@/components/report/sidebar/filters/FilterItem';
import { PropertiesCombobox } from '@/components/report/sidebar/PropertiesCombobox';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { ComboboxEvents } from '@/components/ui/combobox-events';
import { SheetContent } from '@/components/ui/sheet';
import { useAppParams } from '@/hooks/use-app-params';
import { useEventNames } from '@/hooks/use-event-names';
import {
  useEventQueryFilters,
  useEventQueryNamesFilter,
} from '@/hooks/use-event-query-filters';
import { useProfileValues } from '@/hooks/use-profile-values';
import { cn } from '@/utils/cn';

export interface OverviewFiltersProps {
  nuqsOptions?: NuqsOptions;
  enableEventsFilter?: boolean;
  mode?: 'events' | 'profile';
}

const Seperator = () => <div className="-mx-6 h-px bg-border" />;
const Heading = ({
  title,
  icon: Icon,
}: {
  title: string;
  icon: LucideIcon;
}) => (
  <div className="row items-center gap-2">
    <Icon className="size-4" />
    <h2 className="font-medium text-sm">{title}</h2>
  </div>
);

export default function OverviewFilters({
  nuqsOptions,
  enableEventsFilter,
  mode,
}: OverviewFiltersProps) {
  const { projectId } = useAppParams();
  const [filters, setFilter, setFilters, removeFilter] =
    useEventQueryFilters(nuqsOptions);
  const [event, setEvent] = useEventQueryNamesFilter(nuqsOptions);
  const eventNames = useEventNames({ projectId, anyEvents: false });
  const selectedFilters = filters.filter((filter) => filter.value[0] !== null);

  const isCohortFilter = (filter: IChartEventFilter) =>
    filter.operator === 'inCohort' || filter.operator === 'notInCohort';

  const updateCohortFilter = (updated: IChartEventFilter) => {
    setFilters((prev) =>
      prev.map((f) =>
        f.name === updated.name
          ? {
              id: updated.id ?? updated.name,
              name: updated.name,
              operator: updated.operator,
              value: updated.value.map((v) => (v == null ? '' : String(v))),
              ...(updated.cohortIds ? { cohortIds: updated.cohortIds } : {}),
              ...(updated.cohortId ? { cohortId: updated.cohortId } : {}),
            }
          : f
      )
    );
  };
  return (
    <SheetContent className="[&>button.absolute]:hidden">
      <ModalHeader title="Filters" />
      <div className="flex flex-col gap-4">
        <Heading icon={SparklesIcon} title="Ask AI" />
        <OverviewAICommand className="w-full" />
        <Seperator />
        <Heading icon={GlobeIcon} title="Origins" />
        <OriginFilter />
        <Seperator />
        {enableEventsFilter && (
          <>
            <Heading icon={GanttChartIcon} title="Events" />
            <ComboboxEvents
              className="w-full"
              items={eventNames}
              maxDisplayItems={2}
              multiple
              onChange={setEvent}
              placeholder="Select event"
              searchable
              size="lg"
              value={event}
            />
            <Seperator />
          </>
        )}
      </div>
      <Heading icon={SlidersHorizontal} title="Filters" />
      <div className="flex flex-col gap-2">
        <div className={cn('rounded-lg border bg-card')}>
          {selectedFilters.length === 0 && (
            <div className="p-4 text-center text-muted-foreground text-sm">
              No filters selected
            </div>
          )}
          {selectedFilters.map((filter) => {
            if (isCohortFilter(filter)) {
              return (
                <PureCohortFilterItem
                  className="border-t p-4 first:border-0"
                  filter={filter}
                  key={filter.id ?? filter.name}
                  onChangeCohort={(cohortIds, original) =>
                    updateCohortFilter({
                      ...original,
                      cohortId: cohortIds[0],
                      cohortIds,
                    })
                  }
                  onChangeOperator={(operator, original) =>
                    updateCohortFilter({ ...original, operator })
                  }
                  onRemove={(target) => removeFilter(target.name)}
                />
              );
            }
            return (
              <PureFilterItem
                className="border-t p-4 first:border-0"
                eventName="*"
                filter={filter}
                key={filter.name}
                onChangeOperator={(operator) => {
                  setFilter(filter.name, filter.value, operator);
                }}
                onChangeValue={(value) => {
                  setFilter(filter.name, value, filter.operator);
                }}
                onRemove={() => {
                  setFilter(filter.name, [], filter.operator);
                }}
              />
            );
          })}
        </div>
        <PropertiesCombobox
          categories={
            mode === 'events'
              ? ['event']
              : mode === 'profile'
                ? ['profile']
                : ['event', 'profile', 'group', 'cohort']
          }
          exclude={
            enableEventsFilter
              ? []
              : [
                  'properties.*',
                  'name',
                  'duration',
                  'created_at',
                  'has_profile',
                  'revenue',
                ]
          }
          onSelect={(action) => {
            if (action.value === 'cohort') {
              // Only one cohort filter at a time; OR-semantics live inside
              // the filter's cohortIds array.
              const hasCohort = filters.some(isCohortFilter);
              if (hasCohort) {
                return;
              }
              setFilters((prev) => [
                ...prev,
                {
                  id: 'cohort',
                  name: 'cohort',
                  operator: 'inCohort',
                  value: [],
                  cohortIds: [],
                },
              ]);
              return;
            }
            setFilter(action.value, [], 'is');
          }}
        >
          {(setOpen) => (
            <Button
              className="w-full"
              icon={FilterIcon}
              onClick={() => setOpen((p) => !p)}
              size="lg"
              variant="outline"
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
    operator: IChartEventFilterOperator
  ) => void;
}) {
  const values = useProfileValues(projectId, filter.name);

  return (
    <div className="flex items-center gap-2">
      <div>{filter.name}</div>
      <Combobox
        className="flex-1"
        items={values.map((value) => ({
          value,
          label: value,
        }))}
        onChange={(value) => setFilter(filter.name, value, filter.operator)}
        placeholder={'Select a value'}
        value={String(filter.value[0] ?? '')}
      />
      <Button
        onClick={() =>
          setFilter(filter.name, filter.value[0] ?? '', filter.operator)
        }
        size="icon"
        variant="ghost"
      >
        <XIcon />
      </Button>
    </div>
  );
}
