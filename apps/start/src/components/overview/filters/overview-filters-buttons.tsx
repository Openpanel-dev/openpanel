import { Button } from '@/components/ui/button';
import { ComboboxAdvanced } from '@/components/ui/combobox-advanced';
import { FilterOperatorSelect } from '@/components/report/sidebar/filters/FilterOperatorSelect';
import { useAppParams } from '@/hooks/use-app-params';
import {
  useEventQueryFilters,
  useEventQueryNamesFilter,
} from '@/hooks/use-event-query-filters';
import { usePropertyValues } from '@/hooks/use-property-values';
import { pushModal } from '@/modals';
import type { OverviewFiltersProps } from '@/modals/overview-filters';
import { getPropertyLabel } from '@/translations/properties';
import { cn } from '@/utils/cn';
import { operators } from '@openpanel/constants';
import type {
  IChartEventFilter,
  IChartEventFilterOperator,
} from '@openpanel/validation';
import { FilterIcon, X } from 'lucide-react';
import type { Options as NuqsOptions } from 'nuqs';

interface OverviewFiltersButtonsProps {
  className?: string;
  nuqsOptions?: NuqsOptions;
}

export function OverviewFilterButton(props: OverviewFiltersProps) {
  return (
    <Button
      variant="outline"
      responsive
      icon={FilterIcon}
      onClick={() =>
        pushModal('OverviewFilters', {
          ...props,
        })
      }
    >
      Filters
    </Button>
  );
}

interface FilterPillProps {
  filter: IChartEventFilter;
  nuqsOptions?: NuqsOptions;
  onRemove: () => void;
  onChangeOperator: (operator: IChartEventFilterOperator) => void;
  onChangeValue: (value: string[]) => void;
}

function FilterPill({
  filter,
  nuqsOptions,
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
    <div className="flex items-stretch text-sm border rounded-md overflow-hidden h-8">
      {/* Key — opens modal to change the property */}
      <button
        type="button"
        onClick={() => pushModal('OverviewFilters', { nuqsOptions })}
        className="px-2 hover:bg-accent transition-colors cursor-pointer"
      >
        {getPropertyLabel(filter.name)}
      </button>

      {/* Operator dropdown */}
      <FilterOperatorSelect value={filter.operator} onChange={onChangeOperator}>
        <button
          type="button"
          className="px-2 opacity-50 lowercase hover:opacity-100 hover:bg-accent transition-colors border-l cursor-pointer"
        >
          {operators[filter.operator]}
        </button>
      </FilterOperatorSelect>

      {/* Value picker — only when operator needs a value */}
      {!noValueNeeded && (
        <ComboboxAdvanced
          items={potentialValues.map((v) => ({ value: v, label: v }))}
          value={filter.value}
          onChange={onChangeValue}
        >
          <button
            type="button"
            className="px-2 font-semibold hover:bg-accent transition-colors border-l cursor-pointer max-w-40 truncate"
          >
            {filter.value.length > 0 ? (
              filter.value.join(', ')
            ) : (
              <span className="opacity-40 font-normal italic">pick value</span>
            )}
          </button>
        </ComboboxAdvanced>
      )}

      {/* Remove */}
      <button
        type="button"
        onClick={onRemove}
        className="px-2 hover:bg-destructive hover:text-destructive-foreground transition-colors border-l cursor-pointer"
        aria-label="Remove filter"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

export function OverviewFiltersButtons({
  className,
  nuqsOptions,
}: OverviewFiltersButtonsProps) {
  const [events, setEvents] = useEventQueryNamesFilter(nuqsOptions);
  const [filters, setFilter, _setFilters, removeFilter] =
    useEventQueryFilters(nuqsOptions);

  if (filters.length === 0 && events.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {events.map((event) => (
        <Button
          key={event}
          size="sm"
          variant="outline"
          icon={X}
          onClick={() => setEvents((p) => p.filter((e) => e !== event))}
        >
          <strong className="font-semibold">{event}</strong>
        </Button>
      ))}
      {filters.map((filter) => (
        <FilterPill
          key={filter.name}
          filter={filter}
          nuqsOptions={nuqsOptions}
          onRemove={() => removeFilter(filter.name)}
          onChangeOperator={(operator) =>
            setFilter(filter.name, filter.value, operator)
          }
          onChangeValue={(value) =>
            setFilter(filter.name, value, filter.operator)
          }
        />
      ))}
    </div>
  );
}
