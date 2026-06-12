import { useDispatch } from '@/redux';
import { getOperatorsForType } from '@openpanel/constants';
import type {
  IChartEventFilter,
  IChartEventFilterOperator,
  IChartEventFilterValue,
  IChartFilterValueType,
} from '@openpanel/validation';

import {
  changeGlobalFilter,
  removeGlobalFilter,
} from '../../reportSlice';
import { PureCohortFilterItem } from './CohortFilterItem';
import { PureFilterItem } from './FilterItem';

interface GlobalFilterItemProps {
  filter: IChartEventFilter;
}

/**
 * Report-level (global) filter row. Mirrors FilterItem/CohortFilterItem but
 * dispatches to the flat `globalFilters` array instead of an event's own
 * filters. Reuses the pure presentational components so the editing UX is
 * identical to per-event filters.
 */
export function GlobalFilterItem({ filter }: GlobalFilterItemProps) {
  const dispatch = useDispatch();

  const onRemove = ({ id }: IChartEventFilter) => {
    dispatch(removeGlobalFilter({ id }));
  };

  const onChangeValue = (
    value: IChartEventFilterValue[],
    item: IChartEventFilter,
  ) => {
    dispatch(changeGlobalFilter({ ...item, value }));
  };

  const onChangeOperator = (
    operator: IChartEventFilterOperator,
    item: IChartEventFilter,
  ) => {
    dispatch(
      changeGlobalFilter({
        ...item,
        value: item.value ? item.value.filter(Boolean).slice(0, 1) : [],
        operator,
      }),
    );
  };

  const onChangeType = (
    type: IChartFilterValueType,
    item: IChartEventFilter,
  ) => {
    const allowed = getOperatorsForType(type);
    const operator = (allowed as readonly string[]).includes(item.operator)
      ? item.operator
      : allowed[0]!;

    dispatch(
      changeGlobalFilter({
        ...item,
        type,
        operator,
        value:
          operator === item.operator
            ? item.value
            : item.value
              ? item.value.filter(Boolean).slice(0, 1)
              : [],
      }),
    );
  };

  const onChangeCohort = (cohortIds: string[], item: IChartEventFilter) => {
    const firstId = cohortIds[0];
    dispatch(
      changeGlobalFilter({
        ...item,
        name: firstId ? `cohort:${firstId}` : item.name,
        cohortId: firstId,
        cohortIds,
      }),
    );
  };

  const isCohortFilter =
    filter.operator === 'inCohort' || filter.operator === 'notInCohort';

  if (isCohortFilter) {
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

  return (
    <PureFilterItem
      filter={filter}
      eventName="*"
      onRemove={onRemove}
      onChangeValue={onChangeValue}
      onChangeOperator={onChangeOperator}
      onChangeType={onChangeType}
      className="px-4 py-2 shadow-[inset_6px_0_0] shadow-def-300 first:border-t"
    />
  );
}
