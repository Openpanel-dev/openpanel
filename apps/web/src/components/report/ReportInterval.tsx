import { useDispatch, useSelector } from '@/redux';
import type { IInterval } from '@/types';
import {
  isHourIntervalEnabledByRange,
  isMinuteIntervalEnabledByRange,
} from '@/utils/constants';

import { Combobox } from '../ui/combobox';
import { changeInterval } from './reportSlice';

interface ReportIntervalProps {
  className?: string;
}
export function ReportInterval({ className }: ReportIntervalProps) {
  const dispatch = useDispatch();
  const interval = useSelector((state) => state.report.interval);
  const range = useSelector((state) => state.report.range);
  const chartType = useSelector((state) => state.report.chartType);
  if (chartType !== 'linear' && chartType !== 'histogram') {
    return null;
  }

  return (
    <Combobox
      className={className}
      placeholder="Interval"
      onChange={(value) => {
        dispatch(changeInterval(value as IInterval));
      }}
      value={interval}
      items={[
        {
          value: 'minute',
          label: 'Minute',
          disabled: !isMinuteIntervalEnabledByRange(range),
        },
        {
          value: 'hour',
          label: 'Hour',
          disabled: !isHourIntervalEnabledByRange(range),
        },
        {
          value: 'day',
          label: 'Day',
        },
        {
          value: 'month',
          label: 'Month',
          disabled:
            range === 'today' ||
            range === '24h' ||
            range === '1h' ||
            range === '30min',
        },
      ]}
    />
  );
}
