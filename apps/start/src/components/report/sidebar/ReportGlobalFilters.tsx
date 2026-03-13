import { useDispatch, useSelector } from '@/redux';
import type {
  IChartEventFilter,
  IChartEventFilterOperator,
  IChartEventFilterValue,
} from '@openpanel/validation';
import { FilterIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  addGlobalFilter,
  changeGlobalFilter,
  removeGlobalFilter,
} from '../reportSlice';
import { PropertiesCombobox } from './PropertiesCombobox';
import { PureFilterItem } from './filters/FilterItem';
import { PureCohortFilterItem } from './filters/CohortFilterItem';

export function ReportGlobalFilters() {
  const globalFilters = useSelector((state) => state.report.globalFilters);
  const dispatch = useDispatch();

  const onRemove = (filter: IChartEventFilter) => {
    dispatch(removeGlobalFilter({ id: filter.id! }));
  };

  const onChangeValue = (
    value: IChartEventFilterValue[],
    filter: IChartEventFilter,
  ) => {
    dispatch(changeGlobalFilter({ ...filter, value }));
  };

  const onChangeOperator = (
    operator: IChartEventFilterOperator,
    filter: IChartEventFilter,
  ) => {
    dispatch(
      changeGlobalFilter({
        ...filter,
        operator,
        value: filter.value ? filter.value.filter(Boolean).slice(0, 1) : [],
      }),
    );
  };

  const onChangeCohort = (cohortId: string, filter: IChartEventFilter) => {
    dispatch(changeGlobalFilter({ ...filter, cohortId }));
  };

  return (
    <div>
      <h3 className="mb-2 font-medium">Global Filters</h3>
      <div className="flex flex-col gap-2">
        {globalFilters.map((filter) => {
          const isCohortFilter =
            filter.operator === 'inCohort' || filter.operator === 'notInCohort';

          if (isCohortFilter) {
            return (
              <div key={filter.id} className="rounded-lg border bg-def-100">
                <PureCohortFilterItem
                  filter={filter}
                  onRemove={onRemove}
                  onChangeOperator={onChangeOperator}
                  onChangeCohort={onChangeCohort}
                  className="p-2 px-4"
                />
              </div>
            );
          }

          return (
            <div key={filter.id} className="rounded-lg border bg-def-100">
              <PureFilterItem
                filter={filter}
                eventName="*"
                onRemove={onRemove}
                onChangeValue={onChangeValue}
                onChangeOperator={onChangeOperator}
                className="p-2 px-4"
              />
            </div>
          );
        })}

        <PropertiesCombobox
          onSelect={(action) => {
            if (action.cohortId) {
              dispatch(
                addGlobalFilter({
                  name: action.value,
                  operator: 'inCohort',
                  value: [],
                  cohortId: action.cohortId,
                }),
              );
            } else {
              dispatch(
                addGlobalFilter({
                  name: action.value,
                  operator: 'is',
                  value: [],
                }),
              );
            }
          }}
        >
          {(setOpen) => (
            <button
              onClick={() => setOpen((p) => !p)}
              type="button"
              className="flex items-center gap-1 rounded-md border border-border bg-card p-1 px-2 text-sm font-medium leading-none"
            >
              <FilterIcon size={12} /> Add filter
            </button>
          )}
        </PropertiesCombobox>
      </div>
    </div>
  );
}
