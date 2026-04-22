import { ColorSquare } from '@/components/color-square';
import { RenderDots } from '@/components/ui/RenderDots';
import { Button } from '@/components/ui/button';
import { ComboboxAdvanced } from '@/components/ui/combobox-advanced';
import { DropdownMenuComposed } from '@/components/ui/dropdown-menu';
import { useAppParams } from '@/hooks/use-app-params';
import { useCohorts } from '@/hooks/use-cohorts';
import { useDispatch } from '@/redux';
import type {
  IChartEvent,
  IChartEventFilter,
  IChartEventFilterOperator,
} from '@openpanel/validation';
import { SlidersHorizontal, Trash } from 'lucide-react';
import { changeEvent } from '../../reportSlice';

interface CohortFilterItemProps {
  event: IChartEvent;
  filter: IChartEventFilter;
}

interface PureCohortFilterItemProps {
  filter: IChartEventFilter;
  onRemove: (filter: IChartEventFilter) => void;
  onChangeOperator: (
    operator: IChartEventFilterOperator,
    filter: IChartEventFilter,
  ) => void;
  onChangeCohort: (cohortId: string, filter: IChartEventFilter) => void;
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
      }),
    );
  };

  const onChangeOperator = (
    operator: IChartEventFilterOperator,
    { id }: IChartEventFilter,
  ) => {
    dispatch(
      changeEvent({
        ...event,
        type: 'event',
        filters: event.filters.map((item) =>
          item.id === id ? { ...item, operator } : item,
        ),
      }),
    );
  };

  const onChangeCohort = (cohortId: string, { id }: IChartEventFilter) => {
    dispatch(
      changeEvent({
        ...event,
        type: 'event',
        filters: event.filters.map((item) =>
          item.id === id ? { ...item, cohortId } : item,
        ),
      }),
    );
  };

  return (
    <PureCohortFilterItem
      filter={filter}
      onRemove={onRemove}
      onChangeOperator={onChangeOperator}
      onChangeCohort={onChangeCohort}
      className="px-4 py-2 shadow-[inset_6px_0_0] shadow-def-300 first:border-t"
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

  const cohortsCombobox = cohorts.map((cohort) => ({
    value: cohort.id,
    label: cohort.name,
  }));

  const removeFilter = () => {
    onRemove(filter);
  };

  const changeFilterOperator = (operator: IChartEventFilterOperator) => {
    onChangeOperator(operator, filter);
  };

  const changeCohort = (cohortIds: Array<string | number>) => {
    const cohortId = cohortIds[0];
    if (cohortId && typeof cohortId === 'string') {
      onChangeCohort(cohortId, filter);
    }
  };

  return (
    <div className={className}>
      <div className="mb-2 flex items-center gap-2">
        <ColorSquare className="bg-emerald-500">
          <SlidersHorizontal size={10} />
        </ColorSquare>
        <div className="flex flex-1">
          <RenderDots truncate>{filter.name}</RenderDots>
        </div>
        <Button variant="ghost" size="sm" onClick={removeFilter}>
          <Trash size={16} />
        </Button>
      </div>
      <div className="flex gap-1">
        <DropdownMenuComposed
          onChange={changeFilterOperator}
          items={[
            { value: 'inCohort', label: 'In cohort' },
            { value: 'notInCohort', label: 'Not in cohort' },
          ]}
          label="Operator"
        >
          <Button variant="outline" className="whitespace-nowrap">
            {filter.operator === 'inCohort' ? 'In cohort' : 'Not in cohort'}
          </Button>
        </DropdownMenuComposed>
        <ComboboxAdvanced
          items={cohortsCombobox}
          value={filter.cohortId ? [filter.cohortId] : []}
          className="flex-1"
          onChange={changeCohort}
          placeholder="Select cohort..."
        />
      </div>
    </div>
  );
}
