import { ColorSquare } from '@/components/color-square';
import { Button } from '@/components/ui/button';
import { ComboboxAdvanced } from '@/components/ui/combobox-advanced';
import { DropdownMenuComposed } from '@/components/ui/dropdown-menu';
import { RenderDots } from '@/components/ui/RenderDots';
import { useAppParams } from '@/hooks/useAppParams';
import { useMappings } from '@/hooks/useMappings';
import { useDispatch, useSelector } from '@/redux';
import { api } from '@/trpc/client';
import { SlidersHorizontal, Trash } from 'lucide-react';

import { operators } from '@openpanel/constants';
import type {
  IChartEvent,
  IChartEventFilterOperator,
  IChartEventFilterValue,
} from '@openpanel/validation';
import { mapKeys } from '@openpanel/validation';

import { changeEvent } from '../../reportSlice';

interface FilterProps {
  event: IChartEvent;
  filter: IChartEvent['filters'][number];
}

export function FilterItem({ filter, event }: FilterProps) {
  const { projectId } = useAppParams();
  const { range, startDate, endDate } = useSelector((state) => state.report);
  const getLabel = useMappings();
  const dispatch = useDispatch();
  const potentialValues = api.chart.values.useQuery({
    event: event.name,
    property: filter.name,
    projectId,
    range,
    startDate,
    endDate,
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

  const changeFilterOperator = (operator: IChartEventFilterOperator) => {
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
      className="px-4 py-2 shadow-[inset_6px_0_0] shadow-def-200 first:border-t"
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
        <DropdownMenuComposed
          onChange={changeFilterOperator}
          items={mapKeys(operators).map((key) => ({
            value: key,
            label: operators[key],
          }))}
          label="Operator"
        >
          <Button variant={'ghost'} className="whitespace-nowrap">
            {operators[filter.operator]}
          </Button>
        </DropdownMenuComposed>
        <ComboboxAdvanced
          items={valuesCombobox}
          value={filter.value}
          className="flex-1"
          onChange={changeFilterValue}
          placeholder="Select..."
        />
      </div>
    </div>
  );
}
