import { ColorSquare } from '@/components/color-square';
import { RenderDots } from '@/components/ui/RenderDots';
import { Button } from '@/components/ui/button';
import { ComboboxAdvanced } from '@/components/ui/combobox-advanced';
import { DropdownMenuComposed } from '@/components/ui/dropdown-menu';
import { InputEnter } from '@/components/ui/input-enter';
import { useAppParams } from '@/hooks/useAppParams';
import { useMappings } from '@/hooks/useMappings';
import { usePropertyValues } from '@/hooks/usePropertyValues';
import { useDispatch, useSelector } from '@/redux';
import { operators } from '@openpanel/constants';
import type {
  IChartEvent,
  IChartEventFilter,
  IChartEventFilterOperator,
  IChartEventFilterValue,
} from '@openpanel/validation';
import { mapKeys } from '@openpanel/validation';
import { SlidersHorizontal, Trash } from 'lucide-react';
import { changeEvent } from '../../reportSlice';

interface FilterProps {
  event: IChartEvent;
  filter: IChartEventFilter;
}

interface PureFilterProps {
  eventName: string;
  filter: IChartEventFilter;
  onRemove: (filter: IChartEventFilter) => void;
  onChangeValue: (
    value: IChartEventFilterValue[],
    filter: IChartEventFilter,
  ) => void;
  onChangeOperator: (
    operator: IChartEventFilterOperator,
    filter: IChartEventFilter,
  ) => void;
  className?: string;
}

export function FilterItem({ filter, event }: FilterProps) {
  const { range, startDate, endDate, interval } = useSelector(
    (state) => state.report,
  );
  const onRemove = ({ id }: IChartEventFilter) => {
    dispatch(
      changeEvent({
        ...event,
        filters: event.filters.filter((item) => item.id !== id),
      }),
    );
  };

  const onChangeValue = (
    value: IChartEventFilterValue[],
    { id }: IChartEventFilter,
  ) => {
    dispatch(
      changeEvent({
        ...event,
        filters: event.filters.map((item) => {
          if (item.id === id) {
            return {
              ...item,
              value,
            };
          }

          return item;
        }),
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
        filters: event.filters.map((item) => {
          if (item.id === id) {
            return {
              ...item,
              value: item.value ? item.value.filter(Boolean).slice(0, 1) : [],
              operator,
            };
          }

          return item;
        }),
      }),
    );
  };

  const dispatch = useDispatch();
  return (
    <PureFilterItem
      filter={filter}
      eventName={event.name}
      onRemove={onRemove}
      onChangeValue={onChangeValue}
      onChangeOperator={onChangeOperator}
      className="px-4 py-2 shadow-[inset_6px_0_0] shadow-def-300 first:border-t"
    />
  );
}

export function PureFilterItem({
  filter,
  eventName,
  onRemove,
  onChangeValue,
  onChangeOperator,
  className,
}: PureFilterProps) {
  const { projectId } = useAppParams();
  const getLabel = useMappings();

  const potentialValues = usePropertyValues({
    event: eventName,
    property: filter.name,
    projectId,
  });

  const valuesCombobox =
    potentialValues.map((item) => ({
      value: item,
      label: getLabel(item),
    })) ?? [];

  const removeFilter = () => {
    onRemove(filter);
  };

  const changeFilterValue = (value: IChartEventFilterValue[]) => {
    onChangeValue(value, filter);
  };

  const changeFilterOperator = (operator: IChartEventFilterOperator) => {
    onChangeOperator(operator, filter);
  };

  return (
    <div className={className}>
      <div className="mb-2 flex items-center gap-2">
        <ColorSquare className="bg-emerald-500">
          <SlidersHorizontal size={10} />
        </ColorSquare>
        <div className="flex flex-1 ">
          <RenderDots truncate>{filter.name}</RenderDots>
        </div>
        <Button variant="ghost" size="sm" onClick={removeFilter}>
          <Trash size={16} />
        </Button>
      </div>
      <div className="flex gap-1">
        <DropdownMenuComposed
          onChange={changeFilterOperator}
          items={mapKeys(operators).map((key) => ({
            value: key,
            label: operators[key],
          }))}
          label="Operator"
        >
          <Button variant={'outline'} className="whitespace-nowrap">
            {operators[filter.operator]}
          </Button>
        </DropdownMenuComposed>
        {filter.operator === 'is' || filter.operator === 'isNot' ? (
          <ComboboxAdvanced
            items={valuesCombobox}
            value={filter.value}
            className="flex-1"
            onChange={changeFilterValue}
            placeholder="Select..."
          />
        ) : (
          <InputEnter
            value={filter.value[0] ? String(filter.value[0]) : ''}
            onChangeValue={(value) => changeFilterValue([value])}
          />
        )}
      </div>
    </div>
  );
}
