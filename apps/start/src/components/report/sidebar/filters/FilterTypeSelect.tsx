import { Button } from '@/components/ui/button';
import { DropdownMenuComposed } from '@/components/ui/dropdown-menu';
import { filterValueTypes } from '@openpanel/constants';
import type { IChartFilterValueType } from '@openpanel/validation';
import { mapKeys } from '@openpanel/validation';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const trigger = children ?? (
    <Button variant="outline" className="whitespace-nowrap">
      {filterValueTypes[value ?? 'string']}
    </Button>
  );

  return (
    <DropdownMenuComposed
      onChange={onChange}
      items={mapKeys(filterValueTypes).map((key) => ({
        value: key,
        label: filterValueTypes[key],
      }))}
      label={t('reports.value_type')}
    >
      {trigger}
    </DropdownMenuComposed>
  );
}
