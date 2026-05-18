import { FilterIcon, type LucideIcon, SlidersHorizontal } from 'lucide-react';
import type { IChartEventFilter } from '@openpanel/validation';
import {
  PropertiesCombobox,
  type PropertiesComboboxCategory,
} from '@/components/report/sidebar/PropertiesCombobox';
import { PureCohortFilterItem } from '@/components/report/sidebar/filters/CohortFilterItem';
import { PureFilterItem } from '@/components/report/sidebar/filters/FilterItem';
import { Button } from '@/components/ui/button';
import { SheetContent } from '@/components/ui/sheet';
import { useTableFilters } from '@/hooks/use-table-filters';
import { cn } from '@/utils/cn';
import { ModalHeader } from './Modal/Container';

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
    <h2 className="text-sm font-medium">{title}</h2>
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

  const addFilter = (action: { value: string; cohortId?: string }) => {
    // Use the property name as the id so the URL serializer (which encodes
    // by name) round-trips cleanly on reload.
    const next: IChartEventFilter = action.cohortId
      ? {
          id: action.value,
          name: action.value,
          operator: 'inCohort',
          value: [],
          cohortId: action.cohortId,
        }
      : {
          id: action.value,
          name: action.value,
          operator: 'is',
          value: [],
        };
    setFilters([...filters, next]);
  };

  return (
    <SheetContent className="[&>button.absolute]:hidden">
      <ModalHeader title={title} />
      <Heading icon={SlidersHorizontal} title="Filters" />
      <div className="flex flex-col gap-2">
        <div className={cn('bg-card rounded-lg border')}>
          {filters.length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">
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
                  key={filter.id ?? filter.name}
                  filter={filter}
                  onRemove={removeFilter}
                  onChangeOperator={(operator, original) =>
                    setFilter({ ...original, operator })
                  }
                  onChangeCohort={(cohortIds, original) => {
                    // Keep `id` stable so the setFilter helper (which matches
                    // by id) still finds this row. URL serializes by `name`,
                    // which we update — on reload the parser will resync id
                    // from the name. Write both cohort fields so legacy
                    // consumers reading `cohortId` keep working.
                    const firstId = cohortIds[0];
                    setFilter({
                      ...original,
                      name: firstId ? `cohort:${firstId}` : original.name,
                      cohortId: firstId,
                      cohortIds,
                    });
                  }}
                />
              );
            }
            return (
              <PureFilterItem
                className="border-t p-4 first:border-0"
                eventName="screen_view"
                key={filter.id ?? filter.name}
                filter={filter}
                onRemove={removeFilter}
                onChangeValue={(value, original) =>
                  setFilter({ ...original, value })
                }
                onChangeOperator={(operator, original) =>
                  setFilter({
                    ...original,
                    operator,
                    value: original.value.filter(Boolean).slice(0, 1),
                  })
                }
              />
            );
          })}
        </div>
        <PropertiesCombobox categories={categories} onSelect={addFilter}>
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
