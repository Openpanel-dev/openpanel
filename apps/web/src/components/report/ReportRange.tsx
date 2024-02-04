import type { IChartRange } from '@/types';
import { timeRanges } from '@/utils/constants';
import { CalendarIcon } from 'lucide-react';

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
