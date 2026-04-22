import { Button } from '@/components/ui/button';
import { DropdownMenuComposed } from '@/components/ui/dropdown-menu';
import { operators } from '@openpanel/constants';
import type { IChartEventFilterOperator } from '@openpanel/validation';
import { mapKeys } from '@openpanel/validation';

interface FilterOperatorSelectProps {
  value: IChartEventFilterOperator;
  onChange: (operator: IChartEventFilterOperator) => void;
  children?: React.ReactNode;
}

export function FilterOperatorSelect({
  value,
  onChange,
  children,
}: FilterOperatorSelectProps) {
  const trigger = children ?? (
    <Button variant="outline" className="whitespace-nowrap">
      {operators[value]}
    </Button>
  );

  return (
    <DropdownMenuComposed
      onChange={onChange}
      items={mapKeys(operators)
        // Cohort operators are surfaced via CohortFilterItem, not here.
        .filter((key) => key !== 'inCohort' && key !== 'notInCohort')
        .map((key) => ({
          value: key,
          label: operators[key],
        }))}
      label="Operator"
    >
      {trigger}
    </DropdownMenuComposed>
  );
}
