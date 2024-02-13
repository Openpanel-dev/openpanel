import { api } from '@/app/_trpc/client';
import { ColorSquare } from '@/components/ColorSquare';
import { Dropdown } from '@/components/Dropdown';
import { Button } from '@/components/ui/button';
import { ComboboxAdvanced } from '@/components/ui/combobox-advanced';
import { RenderDots } from '@/components/ui/RenderDots';
import { useAppParams } from '@/hooks/useAppParams';
import { useMappings } from '@/hooks/useMappings';
import { useDispatch } from '@/redux';
import type {
  IChartEvent,
  IChartEventFilter,
  IChartEventFilterValue,
} from '@/types';
import { operators } from '@/utils/constants';
import { SlidersHorizontal, Trash } from 'lucide-react';

import { changeEvent } from '../../reportSlice';

interface FilterProps {
  event: IChartEvent;
  filter: IChartEvent['filters'][number];
}

export function FilterItem({ filter, event }: FilterProps) {
  const { projectId } = useAppParams();
  const getLabel = useMappings();
  const dispatch = useDispatch();
  const potentialValues = api.chart.values.useQuery({
    event: event.name,
    property: filter.name,
    projectId,
  });

  const valuesCombobox =
    potentialValues.data?.values?.map((item) => ({
      value: item,
      label: getLabel(item),
    })) ?? [];

  const removeFilter = () => {
    dispatch(
      changeEvent({
        ...event,
        filters: event.filters.filter((item) => item.id !== filter.id),
      })
    );
  };

  const changeFilterValue = (
    value: IChartEventFilterValue | IChartEventFilterValue[]
  ) => {
    dispatch(
      changeEvent({
        ...event,
        filters: event.filters.map((item) => {
          if (item.id === filter.id) {
            return {
              ...item,
              value: Array.isArray(value) ? value : [value],
            };
          }

          return item;
        }),
      })
    );
  };

  const changeFilterOperator = (operator: IChartEventFilter['operator']) => {
    dispatch(
      changeEvent({
        ...event,
        filters: event.filters.map((item) => {
          if (item.id === filter.id) {
            return {
              ...item,
              operator,
            };
          }

          return item;
        }),
      })
    );
  };

  return (
    <div
      key={filter.name}
      className="px-4 py-2 shadow-[inset_6px_0_0] shadow-slate-200 first:border-t"
    >
      <div className="mb-2 flex items-center gap-2">
        <ColorSquare className="bg-emerald-500">
          <SlidersHorizontal size={10} />
        </ColorSquare>
        <div className="flex flex-1 text-sm">
          <RenderDots truncate>{filter.name}</RenderDots>
        </div>
        <Button variant="ghost" size="sm" onClick={removeFilter}>
          <Trash size={16} />
        </Button>
      </div>
      <div className="flex gap-1">
        <Dropdown
          onChange={changeFilterOperator}
          items={Object.entries(operators).map(([key, value]) => ({
            value: key as IChartEventFilter['operator'],
            label: value,
          }))}
          label="Operator"
        >
          <Button variant={'ghost'} className="whitespace-nowrap">
            {operators[filter.operator]}
          </Button>
        </Dropdown>
        <ComboboxAdvanced
          items={valuesCombobox}
          value={filter.value}
          onChange={(setFn) => {
            changeFilterValue(
              typeof setFn === 'function' ? setFn(filter.value) : setFn
            );
          }}
          placeholder="Select..."
        />
      </div>
    </div>
  );
}
