import { useDispatch, useSelector } from '@/redux';
import { ClockIcon } from 'lucide-react';

import {
  isHourIntervalEnabledByRange,
  isMinuteIntervalEnabledByRange,
} from '@openpanel/constants';

import { cn } from '@/utils/cn';
import type { IChartRange, IChartType, IInterval } from '@openpanel/validation';
import { Button } from '../ui/button';
import { CommandShortcut } from '../ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { changeInterval } from './reportSlice';

interface ReportIntervalProps {
  className?: string;
  interval: IInterval;
  onChange: (range: IInterval) => void;
  chartType: IChartType;
  range: IChartRange;
}
export function ReportInterval({
  className,
  interval,
  onChange,
  chartType,
  range,
}: ReportIntervalProps) {
  if (
    chartType !== 'linear' &&
    chartType !== 'histogram' &&
    chartType !== 'area' &&
    chartType !== 'metric' &&
    chartType !== 'retention' &&
    chartType !== 'conversion'
  ) {
    return null;
  }

  const items = [
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
      disabled:
        range === 'today' ||
        range === 'lastHour' ||
        range === '30min' ||
        range === '7d',
    },
    {
      value: 'month',
      label: 'Month',
      disabled: range === 'today' || range === 'lastHour' || range === '30min',
    },
  ];

  const selectedItem = items.find((item) => item.value === interval);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          icon={ClockIcon}
          className={cn('justify-start', className)}
        >
          {items.find((item) => item.value === interval)?.label || 'Interval'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel className="row items-center justify-between">
          Select interval
          {!!selectedItem && (
            <CommandShortcut>{selectedItem?.label}</CommandShortcut>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {items.map((item) => (
            <DropdownMenuItem
              key={item.value}
              onClick={() => onChange(item.value as IInterval)}
              disabled={item.disabled}
            >
              {item.label}
              {item.value === interval && (
                <DropdownMenuShortcut>
                  <ClockIcon className="size-4" />
                </DropdownMenuShortcut>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
