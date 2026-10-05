import {
  getCohortIds,
  type IChartEventFilter,
  type IChartEventFilterOperator,
  operators,
} from '@openpanel/core/modules/report/report.constants';
import { FilterIcon, X } from 'lucide-react';
import type { Options as NuqsOptions } from 'nuqs';
import { FilterOperatorSelect } from '@/components/report/sidebar/filters/FilterOperatorSelect';
import { Button } from '@/components/ui/button';
import { ComboboxAdvanced } from '@/components/ui/combobox-advanced';
import { DropdownMenuComposed } from '@/components/ui/dropdown-menu';
import { useAppParams } from '@/hooks/use-app-params';
import { useCohorts } from '@/hooks/use-cohorts';
import {
  useEventQueryFilters,
  useEventQueryNamesFilter,
} from '@/hooks/use-event-query-filters';
import { usePropertyValues } from '@/hooks/use-property-values';
import { pushModal } from '@/modals';
import type { OverviewFiltersProps } from '@/modals/overview-filters';
import { getPropertyLabel } from '@/translations/properties';
import { cn } from '@/utils/cn';

/** What the Filters modal offers when it is opened from a filter pill. */
type FilterModalOptions = Omit<OverviewFiltersProps, 'nuqsOptions'>;

interface OverviewFiltersButtonsProps {
  className?: string;
  nuqsOptions?: NuqsOptions;
  filterModal?: FilterModalOptions;
}

export function OverviewFilterButton(props: OverviewFiltersProps) {
  return (
    <Button
      icon={FilterIcon}
      onClick={() =>
        pushModal('OverviewFilters', {
          ...props,
        })
      }
      responsive
      variant="outline"
    >
      Filters
    </Button>
  );
}

interface FilterPillProps {
  filter: IChartEventFilter;
  nuqsOptions?: NuqsOptions;
  filterModal?: FilterModalOptions;
  onRemove: () => void;
  onChangeOperator: (operator: IChartEventFilterOperator) => void;
  onChangeValue: (value: string[]) => void;
}

interface CohortFilterPillProps {
  filter: IChartEventFilter;
  nuqsOptions?: NuqsOptions;
  filterModal?: FilterModalOptions;
  onRemove: () => void;
  onChangeOperator: (operator: IChartEventFilterOperator) => void;
  onChangeCohorts: (cohortIds: string[]) => void;
}

function CohortFilterPill({
  filter,
  nuqsOptions,
  filterModal,
  onRemove,
  onChangeOperator,
  onChangeCohorts,
}: CohortFilterPillProps) {
  const { projectId } = useAppParams();
  const cohorts = useCohorts({ projectId, includeCount: false });
  const selectedIds = getCohortIds(filter);
  const cohortItems = cohorts.map((c) => ({ value: c.id, label: c.name }));
  const valueLabel = selectedIds
    .map((id) => cohorts.find((c) => c.id === id)?.name)
    .filter(Boolean)
    .join(', ');

  return (
    <div className="flex h-8 items-stretch overflow-hidden rounded-md border text-sm">
      <button
        className="cursor-pointer px-2 transition-colors hover:bg-accent"
        onClick={() =>
          pushModal('OverviewFilters', { ...filterModal, nuqsOptions })
        }
        type="button"
      >
        Cohort
      </button>
      <DropdownMenuComposed
        items={[
          { value: 'inCohort', label: 'In cohort' },
          { value: 'notInCohort', label: 'Not in cohort' },
        ]}
        label="Operator"
        onChange={onChangeOperator}
      >
        <button
          className="cursor-pointer border-l px-2 lowercase opacity-50 transition-colors hover:bg-accent hover:opacity-100"
          type="button"
        >
          {filter.operator === 'inCohort' ? 'in cohort' : 'not in cohort'}
        </button>
      </DropdownMenuComposed>
      <ComboboxAdvanced
        items={cohortItems}
        onChange={(next) =>
          onChangeCohorts(
            next.filter((id): id is string => typeof id === 'string')
          )
        }
        value={selectedIds}
      >
        <button
          className="max-w-40 cursor-pointer truncate border-l px-2 font-semibold transition-colors hover:bg-accent"
          type="button"
        >
          {valueLabel || (
            <span className="font-normal italic opacity-40">pick cohort</span>
          )}
        </button>
      </ComboboxAdvanced>
      <button
        aria-label="Remove filter"
        className="cursor-pointer border-l px-2 transition-colors hover:bg-destructive hover:text-destructive-foreground"
        onClick={onRemove}
        type="button"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

function FilterPill({
  filter,
  nuqsOptions,
  filterModal,
  onRemove,
  onChangeOperator,
  onChangeValue,
}: FilterPillProps) {
  const { projectId } = useAppParams();
  const potentialValues = usePropertyValues({
    event: '*',
    property: filter.name,
    projectId,
  });

  const noValueNeeded =
    filter.operator === 'isNull' || filter.operator === 'isNotNull';

  return (
    <div className="flex h-8 items-stretch overflow-hidden rounded-md border text-sm">
      {/* Key — opens modal to change the property */}
      <button
        className="cursor-pointer px-2 transition-colors hover:bg-accent"
        onClick={() =>
          pushModal('OverviewFilters', { ...filterModal, nuqsOptions })
        }
        type="button"
      >
        {getPropertyLabel(filter.name)}
      </button>

      <FilterOperatorSelect onChange={onChangeOperator} value={filter.operator}>
        <button
          className="cursor-pointer border-l px-2 lowercase opacity-50 transition-colors hover:bg-accent hover:opacity-100"
          type="button"
        >
          {operators[filter.operator]}
        </button>
      </FilterOperatorSelect>

      {/* Value picker — only when operator needs a value */}
      {!noValueNeeded && (
        <ComboboxAdvanced
          items={potentialValues.map((v) => ({ value: v, label: v }))}
          onChange={onChangeValue}
          value={filter.value}
        >
          <button
            className="max-w-40 cursor-pointer truncate border-l px-2 font-semibold transition-colors hover:bg-accent"
            type="button"
          >
            {filter.value.length > 0 ? (
              filter.value.join(', ')
            ) : (
              <span className="font-normal italic opacity-40">pick value</span>
            )}
          </button>
        </ComboboxAdvanced>
      )}

      <button
        aria-label="Remove filter"
        className="cursor-pointer border-l px-2 transition-colors hover:bg-destructive hover:text-destructive-foreground"
        onClick={onRemove}
        type="button"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

export function OverviewFiltersButtons({
  className,
  nuqsOptions,
  filterModal,
}: OverviewFiltersButtonsProps) {
  const [events, setEvents] = useEventQueryNamesFilter(nuqsOptions);
  const [filters, setFilter, setFilters, removeFilter] =
    useEventQueryFilters(nuqsOptions);

  if (filters.length === 0 && events.length === 0) {
    return null;
  }

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
    <div className={cn('flex flex-wrap gap-2', className)}>
      {events.map((event) => (
        <Button
          icon={X}
          key={event}
          onClick={() => setEvents((p) => p.filter((e) => e !== event))}
          size="sm"
          variant="outline"
        >
          <strong className="font-semibold">{event}</strong>
        </Button>
      ))}
      {filters.map((filter) => {
        const isCohort =
          filter.operator === 'inCohort' || filter.operator === 'notInCohort';
        if (isCohort) {
          return (
            <CohortFilterPill
              filter={filter}
              filterModal={filterModal}
              key={filter.name}
              nuqsOptions={nuqsOptions}
              onChangeCohorts={(cohortIds) =>
                updateCohortFilter({
                  ...filter,
                  cohortId: cohortIds[0],
                  cohortIds,
                })
              }
              onChangeOperator={(operator) =>
                updateCohortFilter({ ...filter, operator })
              }
              onRemove={() => removeFilter(filter.name)}
            />
          );
        }
        return (
          <FilterPill
            filter={filter}
            filterModal={filterModal}
            key={filter.name}
            nuqsOptions={nuqsOptions}
            onChangeOperator={(operator) =>
              setFilter(filter.name, filter.value, operator)
            }
            onChangeValue={(value) =>
              setFilter(filter.name, value, filter.operator)
            }
            onRemove={() => removeFilter(filter.name)}
          />
        );
      })}
    </div>
  );
}
