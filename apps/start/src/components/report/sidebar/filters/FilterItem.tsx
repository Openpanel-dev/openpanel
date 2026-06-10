import { ColorSquare } from '@/components/color-square';
import { FilterOperatorSelect } from '@/components/report/sidebar/filters/FilterOperatorSelect';
import { FilterTypeSelect } from '@/components/report/sidebar/filters/FilterTypeSelect';
import { RenderDots } from '@/components/ui/RenderDots';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { ComboboxAdvanced } from '@/components/ui/combobox-advanced';
import { ComboboxEvents } from '@/components/ui/combobox-events';
import { InputEnter } from '@/components/ui/input-enter';
import { useAppParams } from '@/hooks/use-app-params';
import { useEventNames } from '@/hooks/use-event-names';
import { usePropertyValues } from '@/hooks/use-property-values';
import { useDispatch } from '@/redux';
import { getOperatorsForType } from '@openpanel/constants';
import type {
  IChartEvent,
  IChartEventFilter,
  IChartEventFilterOperator,
  IChartEventFilterValue,
  IChartFilterValueType,
} from '@openpanel/validation';

import { SlidersHorizontal, Trash } from 'lucide-react';
import { changeEvent } from '../../reportSlice';

// Client-side sanity check: can this raw value possibly match the chosen cast
// type? Mirrors the SQL casts in packages/db filter-cast.ts. Returns an error
// message to show inline, or undefined when valid (or empty / untyped).
function validateFilterValue(
  value: string,
  type: IChartFilterValueType | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }
  switch (type) {
    case 'number':
      return Number.isFinite(Number(value)) ? undefined : 'Not a valid number';
    case 'date':
    case 'datetime':
      return Number.isNaN(Date.parse(value)) ? 'Not a valid date' : undefined;
    case 'boolean':
      return value === 'true' || value === 'false'
        ? undefined
        : 'Use "true" or "false"';
    default:
      return undefined;
  }
}

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
  // Optional: surfaces the cast-type select. Callers that don't pass it (the
  // overview/table/cohort modals) simply don't render the control.
  onChangeType?: (
    type: IChartFilterValueType,
    filter: IChartEventFilter,
  ) => void;
  className?: string;
  immediateInput?: boolean;
}

export function FilterItem({ filter, event }: FilterProps) {
  const onRemove = ({ id }: IChartEventFilter) => {
    dispatch(
      changeEvent({
        ...event,
        filters: event.filters.filter((item) => item.id !== id),
        type: 'event',
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
        type: 'event',
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
        type: 'event',
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

  const onChangeType = (
    type: IChartFilterValueType,
    { id }: IChartEventFilter,
  ) => {
    dispatch(
      changeEvent({
        ...event,
        type: 'event',
        filters: event.filters.map((item) => {
          if (item.id !== id) {
            return item;
          }

          // Keep the current operator if it's still valid for the new type,
          // otherwise fall back to the first allowed one (and trim the value
          // like onChangeOperator does, since the input shape may change).
          const allowed = getOperatorsForType(type);
          const operator = (allowed as readonly string[]).includes(
            item.operator,
          )
            ? item.operator
            : allowed[0]!;

          return {
            ...item,
            type,
            operator,
            value:
              operator === item.operator
                ? item.value
                : item.value
                  ? item.value.filter(Boolean).slice(0, 1)
                  : [],
          };
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
      onChangeType={onChangeType}
      className="px-4 py-2 shadow-[inset_6px_0_0] shadow-def-300 first:border-t"
    />
  );
}

const BOOLEAN_VALUE_ITEMS = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
];

export function PureFilterItem({
  filter,
  eventName,
  onRemove,
  onChangeValue,
  onChangeOperator,
  onChangeType,
  className,
  immediateInput,
}: PureFilterProps) {
  const { projectId } = useAppParams();

  const isBooleanSessionFilter = filter.name === 'session.is_bounce';
  const isPerformedEventFilter = filter.name === 'session.performed_event';
  // The session.* filters above have a fixed shape (yes/no, event select), so
  // the cast-type control doesn't apply to them. Also requires the caller to
  // opt in by passing onChangeType.
  const showTypeSelect =
    !!onChangeType && !isBooleanSessionFilter && !isPerformedEventFilter;
  // Only the free-text input path (gt/gte/lt/lte) carries a single typed value
  // we can validate inline; is/isNot use a multi-value combobox.
  const usesTypedInput =
    showTypeSelect &&
    filter.operator !== 'is' &&
    filter.operator !== 'isNot';
  const valueError = usesTypedInput
    ? validateFilterValue(
        filter.value[0] != null ? String(filter.value[0]) : '',
        filter.type,
      )
    : undefined;

  const potentialValues = usePropertyValues({
    event: eventName,
    property: filter.name,
    projectId,
    // session.* filters live on the sessions row, not on event properties.
    // The standard property-values endpoint can't enumerate them, so we
    // bypass the lookup entirely.
    enabled: !filter.name.startsWith('session.'),
  });

  const eventNames = useEventNames({
    projectId,
    anyEvents: false,
    enabled: isPerformedEventFilter,
  });

  const valuesCombobox =
    potentialValues.map((item) => ({
      value: item,
      label: item,
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

  const changeFilterType = (type: IChartFilterValueType) => {
    onChangeType?.(type, filter);
  };

  const renderValueControl = () => {
    if (isBooleanSessionFilter) {
      return (
        <Combobox
          className="flex-1"
          items={BOOLEAN_VALUE_ITEMS}
          value={
            filter.value[0] === undefined ? null : String(filter.value[0])
          }
          onChange={(v) => changeFilterValue([v])}
          placeholder="Yes / No"
        />
      );
    }

    if (isPerformedEventFilter) {
      return (
        <ComboboxEvents
          className="flex-1"
          items={eventNames}
          value={filter.value[0] ? String(filter.value[0]) : null}
          onChange={(v: string) => changeFilterValue([v])}
          placeholder="Select event"
          searchable
        />
      );
    }

    if (filter.operator === 'is' || filter.operator === 'isNot') {
      return (
        <ComboboxAdvanced
          items={valuesCombobox}
          value={filter.value}
          className="flex-1"
          onChange={changeFilterValue}
          placeholder="Select..."
        />
      );
    }

    return (
      <InputEnter
        value={filter.value[0] ? String(filter.value[0]) : ''}
        onChangeValue={(value) => changeFilterValue([value])}
        immediate={immediateInput}
        error={valueError}
      />
    );
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
        {showTypeSelect && (
          <FilterTypeSelect
            value={filter.type}
            onChange={changeFilterType}
          />
        )}
        <FilterOperatorSelect
          value={filter.operator}
          onChange={changeFilterOperator}
          type={filter.type}
        />
        {renderValueControl()}
      </div>
      {valueError && (
        <p className="mt-1 text-destructive text-xs">{valueError}</p>
      )}
    </div>
  );
}
