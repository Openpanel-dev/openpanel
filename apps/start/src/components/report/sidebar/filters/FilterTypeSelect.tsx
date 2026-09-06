import type { IChartFilterValueType } from '@openpanel/core/modules/report/report.constants';
import { filterValueTypes } from '@openpanel/core/modules/report/report.constants';
import { Button } from '@/components/ui/button';
import { DropdownMenuComposed } from '@/components/ui/dropdown-menu';
import { mapKeys } from '@/utils/object-to-zod-enums';

interface FilterTypeSelectProps {
  value: IChartFilterValueType | undefined;
  onChange: (type: IChartFilterValueType) => void;
  children?: React.ReactNode;
}

// Cast type for the filter value/column. Drives which operators are available
// (via getOperatorsForType) and how the value/column are cast in SQL. Defaults
// to the "Text" label when unset (legacy filters).
export function FilterTypeSelect({
  value,
  onChange,
  children,
}: FilterTypeSelectProps) {
  const trigger = children ?? (
    <Button className="whitespace-nowrap" variant="outline">
      {filterValueTypes[value ?? 'string']}
    </Button>
  );

  return (
    <DropdownMenuComposed
      items={mapKeys(filterValueTypes).map((key) => ({
        value: key,
        label: filterValueTypes[key],
      }))}
      label="Value type"
      onChange={onChange}
    >
      {trigger}
    </DropdownMenuComposed>
  );
}
