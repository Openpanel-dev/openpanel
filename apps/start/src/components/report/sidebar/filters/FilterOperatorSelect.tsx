import type {
  IChartEventFilterOperator,
  IChartFilterValueType,
} from '@openpanel/core/modules/report/report.constants';
import {
  getOperatorsForType,
  operators,
  operatorsShort,
} from '@openpanel/core/modules/report/report.constants';
import { Button } from '@/components/ui/button';
import { DropdownMenuComposed } from '@/components/ui/dropdown-menu';

interface FilterOperatorSelectProps {
  value: IChartEventFilterOperator;
  onChange: (operator: IChartEventFilterOperator) => void;
  // The filter's declared value type. Constrains which operators are offered
  // (e.g. a Number can't `contains`, a Boolean only `is`/`isNot`).
  type?: IChartFilterValueType;
  children?: React.ReactNode;
}

export function FilterOperatorSelect({
  value,
  onChange,
  type,
  children,
}: FilterOperatorSelectProps) {
  const trigger = children ?? (
    <Button className="whitespace-nowrap" variant="outline">
      {operatorsShort[value]}
    </Button>
  );

  return (
    <DropdownMenuComposed
      items={getOperatorsForType(type).map((key) => ({
        value: key,
        label: operatorsShort[key],
        // Only show the descriptive sub-line when it adds info beyond the
        // short label (i.e. the symbol operators).
        description:
          operatorsShort[key] === operators[key] ? undefined : operators[key],
      }))}
      label="Operator"
      onChange={onChange}
    >
      {trigger}
    </DropdownMenuComposed>
  );
}
