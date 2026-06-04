import { FilterIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  PropertiesCombobox,
  type PropertiesComboboxCategory,
} from '@/components/report/sidebar/PropertiesCombobox';
import { PureCohortFilterItem } from '@/components/report/sidebar/filters/CohortFilterItem';
import { PureFilterItem } from '@/components/report/sidebar/filters/FilterItem';
import type {
  IChartEventFilter,
  IChartEventFilterOperator,
  IChartEventFilterValue,
} from '@openpanel/validation';

interface FiltersBuilderProps {
  value: IChartEventFilter[];
  onChange: (next: IChartEventFilter[]) => void;
  categories?: PropertiesComboboxCategory[];
  /** Event name to scope value-autocomplete suggestions. Optional. */
  eventName?: string;
  /** Label on the "Add filter" trigger button. */
  addLabel?: string;
  className?: string;
}

/**
 * Prop-driven filter list reusing the report editor's PropertiesCombobox +
 * Pure filter item components. Use this on any surface (sessions / profiles /
 * events tables, future dashboards) that needs the same affordance the chart
 * editor exposes, without coupling to Redux.
 */
export function FiltersBuilder({
  value,
  onChange,
  categories = ['event', 'profile', 'group', 'cohort'],
  eventName = '',
  addLabel = 'Add filter',
  className,
}: FiltersBuilderProps) {
  const setFilter = (updated: IChartEventFilter) => {
    onChange(value.map((f) => (f.id === updated.id ? updated : f)));
  };

  const removeFilter = (target: IChartEventFilter) => {
    onChange(value.filter((f) => f.id !== target.id));
  };

  const addFilter = (action: { value: string }) => {
    if (action.value === 'cohort') {
      const hasCohort = value.some(
        (f) => f.operator === 'inCohort' || f.operator === 'notInCohort',
      );
      if (hasCohort) return;
      onChange([
        ...value,
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
    onChange([
      ...value,
      {
        id: action.value,
        name: action.value,
        operator: 'is',
        value: [],
      },
    ]);
  };

  return (
    <div className={className}>
      <div className="col gap-2">
        {value.map((filter) => {
          const isCohort =
            filter.operator === 'inCohort' || filter.operator === 'notInCohort';
          if (isCohort) {
            return (
              <PureCohortFilterItem
                key={filter.id}
                filter={filter}
                className="rounded border bg-def-100 p-3"
                onRemove={removeFilter}
                onChangeOperator={(operator, original) =>
                  setFilter({ ...original, operator })
                }
                onChangeCohort={(cohortIds, original) => {
                  setFilter({
                    ...original,
                    cohortId: cohortIds[0],
                    cohortIds,
                  });
                }}
              />
            );
          }
          return (
            <PureFilterItem
              key={filter.id}
              filter={filter}
              eventName={eventName}
              className="rounded border bg-def-100 p-3"
              immediateInput
              onRemove={removeFilter}
              onChangeValue={(nextValue: IChartEventFilterValue[], original) =>
                setFilter({ ...original, value: nextValue })
              }
              onChangeOperator={(
                operator: IChartEventFilterOperator,
                original,
              ) =>
                setFilter({
                  ...original,
                  operator,
                  // Reset value when switching to/from cohort-like operators,
                  // mirroring the report editor's behaviour.
                  value: original.value.filter(Boolean).slice(0, 1),
                })
              }
            />
          );
        })}
      </div>
      <div className="mt-2">
        <PropertiesCombobox
          categories={categories}
          onSelect={addFilter}
          event={eventName ? ({ name: eventName, id: 'builder' } as never) : undefined}
        >
          {(setOpen) => (
            <Button
              variant="outline"
              size="sm"
              icon={FilterIcon}
              onClick={() => setOpen((p) => !p)}
            >
              {addLabel}
            </Button>
          )}
        </PropertiesCombobox>
      </div>
    </div>
  );
}
