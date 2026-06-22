import { ClockIcon } from 'lucide-react';

import {
  isHourIntervalEnabledByRange,
  isMinuteIntervalEnabledByRange,
} from '@openpanel/constants';

import { cn } from '@/utils/cn';
import type { IChartRange, IChartType, IInterval } from '@openpanel/validation';
import { differenceInDays, isSameDay } from 'date-fns';
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
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
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
      label: t('reports.interval_minute'),
      disabled: !isMinuteIntervalEnabledByRange(range),
    },
    {
      value: 'hour',
      label: t('reports.interval_hour'),
      disabled: !isHourIntervalEnabled,
    },
    {
      value: 'day',
      label: t('reports.interval_day'),
    },
    {
      value: 'week',
      label: t('reports.interval_week'),
      disabled:
        range === 'today' ||
        range === 'lastHour' ||
        range === 'last24h' ||
        range === '30min' ||
        range === '7d',
    },
    {
      value: 'month',
      label: t('reports.interval_month'),
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
          variant="outline"
          icon={ClockIcon}
          className={cn('justify-start', className)}
        >
          {items.find((item) => item.value === interval)?.label ||
            t('reports.interval')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel className="row items-center justify-between">
          {t('reports.select_interval')}
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
