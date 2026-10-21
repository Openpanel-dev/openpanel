import {
  getCohortIds,
  type IChartEvent,
  type IChartEventFilter,
  type IChartEventFilterOperator,
} from '@openpanel/core/modules/report/report.constants';
import { FilterIcon, XIcon } from 'lucide-react';
import { changeEvent } from '../../reportSlice';
import { Button } from '@/components/ui/button';
import { ComboboxAdvanced } from '@/components/ui/combobox-advanced';
import { DropdownMenuComposed } from '@/components/ui/dropdown-menu';
import { RenderDots } from '@/components/ui/RenderDots';
import { useAppParams } from '@/hooks/use-app-params';
import { useCohorts } from '@/hooks/use-cohorts';
import { useDispatch } from '@/redux';
import { cn } from '@/utils/cn';

interface CohortFilterItemProps {
  event: IChartEvent;
  filter: IChartEventFilter;
}

interface PureCohortFilterItemProps {
  filter: IChartEventFilter;
  onRemove: (filter: IChartEventFilter) => void;
  onChangeOperator: (
    operator: IChartEventFilterOperator,
    filter: IChartEventFilter
  ) => void;
  onChangeCohort: (cohortIds: string[], filter: IChartEventFilter) => void;
  className?: string;
}

export function CohortFilterItem({ filter, event }: CohortFilterItemProps) {
  const dispatch = useDispatch();

  const onRemove = ({ id }: IChartEventFilter) => {
    dispatch(
      changeEvent({
        ...event,
        filters: event.filters.filter((item) => item.id !== id),
        type: 'event',
      })
    );
  };

  const onChangeOperator = (
    operator: IChartEventFilterOperator,
    { id }: IChartEventFilter
  ) => {
    dispatch(
      changeEvent({
        ...event,
        type: 'event',
        filters: event.filters.map((item) =>
          item.id === id ? { ...item, operator } : item
        ),
      })
    );
  };

  const onChangeCohort = (cohortIds: string[], { id }: IChartEventFilter) => {
    // Write both `cohortIds` (source of truth) and `cohortId` (legacy, set
    // to the first id) so saved reports loaded by older code keep working.
    const firstId = cohortIds[0];
    dispatch(
      changeEvent({
        ...event,
        type: 'event',
        filters: event.filters.map((item) =>
          item.id === id
            ? {
                ...item,
                name: firstId ? `cohort:${firstId}` : item.name,
                cohortId: firstId,
                cohortIds,
              }
            : item
        ),
      })
    );
  };

  return (
    <PureCohortFilterItem
      filter={filter}
      onChangeCohort={onChangeCohort}
      onChangeOperator={onChangeOperator}
      onRemove={onRemove}
    />
  );
}

export function PureCohortFilterItem({
  filter,
  onRemove,
  onChangeOperator,
  onChangeCohort,
  className,
}: PureCohortFilterItemProps) {
  const { projectId } = useAppParams();

  const cohorts = useCohorts({ projectId, includeCount: false });
  const selectedIds = getCohortIds(filter);

  const cohortsCombobox = cohorts.map((cohort) => ({
    value: cohort.id,
    label: cohort.name,
  }));

  /**
   * The filter's `name` is a `cohort:<id>` sentinel — show one or more
   * cohort names in the header instead of the raw uuid. Falls back to the
   * sentinel while the cohorts query is still loading or when no cohorts
   * are selected yet.
   */
  const cohortLabel =
    selectedIds
      .map((id) => cohorts.find((c) => c.id === id)?.name)
      .filter(Boolean)
      .join(', ') || filter.name;

  const removeFilter = () => {
    onRemove(filter);
  };

  const changeFilterOperator = (operator: IChartEventFilterOperator) => {
    onChangeOperator(operator, filter);
  };

  const changeCohort = (next: Array<string | number>) => {
    onChangeCohort(
      next.filter((id): id is string => typeof id === 'string'),
      filter
    );
  };

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex min-h-6 items-center gap-1.5 text-muted-foreground text-xs">
        <FilterIcon className="shrink-0" size={12} />
        <RenderDots className="min-w-0 font-medium" truncate>
          {cohortLabel}
        </RenderDots>
        <Button
          aria-label="Delete filter"
          className="ml-auto size-6 text-muted-foreground hover:text-foreground"
          onClick={removeFilter}
          size="icon"
          variant="ghost"
        >
          <XIcon size={14} />
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <DropdownMenuComposed
          items={[
            { value: 'inCohort', label: 'In cohort' },
            { value: 'notInCohort', label: 'Not in cohort' },
          ]}
          label="Operator"
          onChange={changeFilterOperator}
        >
          <Button className="whitespace-nowrap" size="sm" variant="input">
            {filter.operator === 'inCohort' ? 'In cohort' : 'Not in cohort'}
          </Button>
        </DropdownMenuComposed>
        <ComboboxAdvanced
          className="min-w-40 flex-1"
          items={cohortsCombobox}
          onChange={changeCohort}
          placeholder="Select cohorts..."
          size="sm"
          value={selectedIds}
          variant="input"
        />
      </div>
    </div>
  );
}
