import type { IChartEventFilter } from '@openpanel/core/modules/report/report.constants';
import { FilterIcon, type LucideIcon, SlidersHorizontal } from 'lucide-react';
import { ModalHeader } from './Modal/Container';
import { PureCohortFilterItem } from '@/components/report/sidebar/filters/CohortFilterItem';
import { PureFilterItem } from '@/components/report/sidebar/filters/FilterItem';
import {
  PropertiesCombobox,
  type PropertiesComboboxCategory,
} from '@/components/report/sidebar/PropertiesCombobox';
import { Button } from '@/components/ui/button';
import { SheetContent } from '@/components/ui/sheet';
import { useTableFilters } from '@/hooks/use-table-filters';
import { cn } from '@/utils/cn';

export interface TableFiltersProps {
  /** URL query-string key the filters are stored under (matches useTableFilters). */
  urlKey: string;
  /** Categories the user can pick from when adding a filter. */
  categories: PropertiesComboboxCategory[];
  /** Sheet title — defaults to "Filters". */
  title?: string;
}

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

/**
 * Generic sheet modal hosting an `IChartEventFilter[]` editor against a named
 * URL key. Layout mirrors `overview-filters.tsx` so every filter sheet in the
 * app feels identical.
 */
export default function TableFilters({
  urlKey,
  categories,
  title = 'Filters',
}: TableFiltersProps) {
  const [filters, setFilters] = useTableFilters(urlKey);

  const setFilter = (updated: IChartEventFilter) => {
    setFilters(filters.map((f) => (f.id === updated.id ? updated : f)));
  };

  const removeFilter = (target: IChartEventFilter) => {
    setFilters(filters.filter((f) => f.id !== target.id));
  };

  const addFilter = (action: { value: string }) => {
    if (action.value === 'cohort') {
      // Only one cohort filter at a time — multi-cohort OR semantics already
      // live inside a single filter's cohortIds array.
      const hasCohort = filters.some(
        (f) => f.operator === 'inCohort' || f.operator === 'notInCohort'
      );
      if (hasCohort) {
        return;
      }
      setFilters([
        ...filters,
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
    // Use the property name as the id so the URL serializer (which encodes
    // by name) round-trips cleanly on reload.
    setFilters([
      ...filters,
      {
        id: action.value,
        name: action.value,
        operator: 'is',
        value: [],
      },
    ]);
  };

  return (
    <SheetContent className="[&>button.absolute]:hidden">
      <ModalHeader title={title} />
      <Heading icon={SlidersHorizontal} title="Filters" />
      <div className="flex flex-col gap-2">
        <div className={cn('rounded-lg border bg-card')}>
          {filters.length === 0 && (
            <div className="p-4 text-center text-muted-foreground text-sm">
              No filters selected
            </div>
          )}
          {filters.map((filter) => {
            const isCohort =
              filter.operator === 'inCohort' ||
              filter.operator === 'notInCohort';
            if (isCohort) {
              return (
                <PureCohortFilterItem
                  className="border-t p-4 first:border-0"
                  filter={filter}
                  key={filter.id ?? filter.name}
                  onChangeCohort={(cohortIds, original) => {
                    // Write both cohort fields so legacy consumers reading
                    // `cohortId` keep working. Name stays stable as `cohort`
                    // (new filters) or `cohort:<id>` (legacy saved filters)
                    // — the URL parser reads the cohortIds segment first.
                    setFilter({
                      ...original,
                      cohortId: cohortIds[0],
                      cohortIds,
                    });
                  }}
                  onChangeOperator={(operator, original) =>
                    setFilter({ ...original, operator })
                  }
                  onRemove={removeFilter}
                />
              );
            }
            return (
              <PureFilterItem
                className="border-t p-4 first:border-0"
                eventName="*"
                filter={filter}
                key={filter.id ?? filter.name}
                onChangeOperator={(operator, original) =>
                  setFilter({
                    ...original,
                    operator,
                    value: original.value.filter(Boolean).slice(0, 1),
                  })
                }
                onChangeValue={(value, original) =>
                  setFilter({ ...original, value })
                }
                onRemove={removeFilter}
              />
            );
          })}
        </div>
        <PropertiesCombobox categories={categories} onSelect={addFilter}>
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
