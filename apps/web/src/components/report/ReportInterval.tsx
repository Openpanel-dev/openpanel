import { useDispatch, useSelector } from '@/redux';
import type { IInterval } from '@/types';
import { isMinuteIntervalEnabledByRange } from '@/utils/constants';

import { Combobox } from '../ui/combobox';
import { changeInterval } from './reportSlice';

export function ReportInterval() {
  const dispatch = useDispatch();
  const interval = useSelector((state) => state.report.interval);
  const range = useSelector((state) => state.report.range);
  const chartType = useSelector((state) => state.report.chartType);
  if (chartType !== 'linear') {
    return null;
  }

  return (
    <Combobox
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
        },
        {
          value: 'day',
          label: 'Day',
        },
        {
          value: 'month',
          label: 'Month',
          disabled: range < 1,
        },
      ]}
    />
  );
}
