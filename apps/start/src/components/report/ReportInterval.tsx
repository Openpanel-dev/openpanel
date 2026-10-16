import type {
  IChartRange,
  IChartType,
  IInterval,
} from '@openpanel/core/modules/report/report.constants';
import {
  isHourIntervalEnabledByRange,
  isMinuteIntervalEnabledByRange,
} from '@openpanel/core/modules/report/report.constants';
import { differenceInDays } from 'date-fns';
import { ClockIcon } from 'lucide-react';
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
import { cn } from '@/utils/cn';

interface ReportIntervalProps {
  className?: string;
  interval: IInterval;
  onChange: (range: IInterval) => void;
  chartType: IChartType;
  range: IChartRange;
  startDate?: string | null;
  endDate?: string | null;
}
export function ReportInterval({
  className,
  interval,
  onChange,
  chartType,
  range,
  startDate,
  endDate,
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

  let isHourIntervalEnabled = isHourIntervalEnabledByRange(range);
  if (startDate && endDate && range === 'custom') {
    isHourIntervalEnabled = differenceInDays(endDate, startDate) <= 4;
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
      disabled: !isHourIntervalEnabled,
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
        range === 'last24h' ||
        range === '30min' ||
        range === '7d',
    },
    {
      value: 'month',
      label: 'Month',
      disabled:
        range === 'today' ||
        range === 'lastHour' ||
        range === 'last24h' ||
        range === '30min',
    },
  ];

  const selectedItem = items.find((item) => item.value === interval);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className={cn('justify-start', className)}
          icon={ClockIcon}
          variant="outline"
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
              disabled={item.disabled}
              key={item.value}
              onClick={() => onChange(item.value as IInterval)}
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
