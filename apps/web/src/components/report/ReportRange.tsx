import { CalendarIcon } from 'lucide-react';

import { timeRanges } from '@mixan/constants';
import type { IChartRange } from '@mixan/validation';

import type { ExtendedComboboxProps } from '../ui/combobox';
import { Combobox } from '../ui/combobox';

export function ReportRange(props: ExtendedComboboxProps<IChartRange>) {
  return (
    <Combobox
      icon={CalendarIcon}
      placeholder={'Range'}
      items={Object.values(timeRanges).map((key) => ({
        label: key,
        value: key,
      }))}
      {...props}
    />
  );
}
