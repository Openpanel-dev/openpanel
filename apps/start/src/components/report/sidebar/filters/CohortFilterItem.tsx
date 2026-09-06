import {
  getCohortIds,
  type IChartEvent,
  type IChartEventFilter,
  type IChartEventFilterOperator,
} from '@openpanel/core/modules/report/report.constants';
import { SlidersHorizontal, Trash } from 'lucide-react';
import { changeEvent } from '../../reportSlice';
import { ColorSquare } from '@/components/color-square';
import { Button } from '@/components/ui/button';
import { ComboboxAdvanced } from '@/components/ui/combobox-advanced';
import { DropdownMenuComposed } from '@/components/ui/dropdown-menu';
import { RenderDots } from '@/components/ui/RenderDots';
import { useAppParams } from '@/hooks/use-app-params';
import { useCohorts } from '@/hooks/use-cohorts';
import { useDispatch } from '@/redux';

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
      className="px-4 py-2 shadow-[inset_6px_0_0] shadow-def-300 first:border-t"
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
    <div className={className}>
      <div className="mb-2 flex items-center gap-2">
        <ColorSquare className="bg-emerald-500">
          <SlidersHorizontal size={10} />
        </ColorSquare>
        <div className="flex flex-1">
          <RenderDots truncate>{cohortLabel}</RenderDots>
        </div>
        <Button onClick={removeFilter} size="sm" variant="ghost">
          <Trash size={16} />
        </Button>
      </div>
      <div className="flex gap-1">
        <DropdownMenuComposed
          items={[
            { value: 'inCohort', label: 'In cohort' },
            { value: 'notInCohort', label: 'Not in cohort' },
          ]}
          label="Operator"
          onChange={changeFilterOperator}
        >
          <Button className="whitespace-nowrap" variant="outline">
            {filter.operator === 'inCohort' ? 'In cohort' : 'Not in cohort'}
          </Button>
        </DropdownMenuComposed>
        <ComboboxAdvanced
          className="flex-1"
          items={cohortsCombobox}
          onChange={changeCohort}
          placeholder="Select cohorts..."
          value={selectedIds}
        />
      </div>
    </div>
  );
}
