import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import {
  isHourIntervalEnabledByRange,
  isMinuteIntervalEnabledByRange,
} from '@openpanel/constants';
import { ClockIcon } from 'lucide-react';
import { Combobox } from '../ui/combobox';

export function OverviewInterval() {
  const { interval, setInterval, range } = useOverviewOptions();

  return (
    <Combobox
      className="hidden md:flex"
      icon={ClockIcon}
      placeholder="Interval"
      onChange={(value) => {
        setInterval(value);
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
          value: 'week',
          label: 'Week',
        },
        {
          value: 'month',
          label: 'Month',
          disabled:
            range === 'today' || range === 'lastHour' || range === '30min',
        },
      ]}
    />
  );
}
