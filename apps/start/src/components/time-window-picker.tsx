import { getDefaultIntervalByDates, timeWindows } from '@openpanel/constants';
import type { IChartRange, IInterval } from '@openpanel/validation';
import { bind } from 'bind-event-listener';
import { endOfDay, format, startOfDay, subDays } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { pushModal, useOnPushModal } from '@/modals';
import { cn } from '@/utils/cn';
import { shouldIgnoreKeypress } from '@/utils/should-ignore-keypress';

interface Props {
  value: IChartRange;
  onChange: (value: IChartRange) => void;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onIntervalChange: (interval: IInterval) => void;
  endDate: string | null;
  startDate: string | null;
  className?: string;
}
export function TimeWindowPicker({
  value,
  onChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  onIntervalChange,
  className,
}: Props) {
  const isDateRangerPickerOpen = useRef(false);
  useOnPushModal('DateRangerPicker', (open) => {
    isDateRangerPickerOpen.current = open;
  });
  const timeWindow = timeWindows[value ?? '30d'];
  const [customDays, setCustomDays] = useState('');

  const handleCustomDays = useCallback(
    (days: number) => {
      if (days < 1 || days > 365) return;
      const end = endOfDay(new Date());
      const start = startOfDay(subDays(new Date(), days - 1));
      onStartDateChange(format(start, 'yyyy-MM-dd HH:mm:ss'));
      onEndDateChange(format(end, 'yyyy-MM-dd HH:mm:ss'));
      onChange('custom');
      const interval = getDefaultIntervalByDates(
        start.toISOString(),
        end.toISOString()
      );
      if (interval) {
        onIntervalChange(interval);
      }
    },
    [onChange, onStartDateChange, onEndDateChange, onIntervalChange]
  );

  const handleCustom = useCallback(() => {
    pushModal('DateRangerPicker', {
      onChange: ({ startDate, endDate, interval }) => {
        onStartDateChange(format(startOfDay(startDate), 'yyyy-MM-dd HH:mm:ss'));
        onEndDateChange(format(endOfDay(endDate), 'yyyy-MM-dd HH:mm:ss'));
        onChange('custom');
        onIntervalChange(interval);
      },
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }, [startDate, endDate]);

  useEffect(() => {
    return bind(document, {
      type: 'keydown',
      listener(event) {
        if (shouldIgnoreKeypress(event)) {
          return;
        }

        if (isDateRangerPickerOpen.current) {
          return;
        }

        const match = Object.values(timeWindows).find(
          (tw) => event.key === tw.shortcut.toLowerCase()
        );
        if (match?.key === 'custom') {
          handleCustom();
        } else if (match) {
          onChange(match.key);
        }
      },
    });
  }, [handleCustom]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className={cn('justify-start', className)}
          icon={CalendarIcon}
          variant="outline"
        >
          {timeWindow?.label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>Time window</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => onChange(timeWindows['30min'].key)}>
            {timeWindows['30min'].label}
            <DropdownMenuShortcut>
              {timeWindows['30min'].shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onChange(timeWindows.lastHour.key)}>
            {timeWindows.lastHour.label}
            <DropdownMenuShortcut>
              {timeWindows.lastHour.shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onChange(timeWindows.today.key)}>
            {timeWindows.today.label}
            <DropdownMenuShortcut>
              {timeWindows.today.shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onChange(timeWindows.yesterday.key)}>
            {timeWindows.yesterday.label}
            <DropdownMenuShortcut>
              {timeWindows.yesterday.shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => onChange(timeWindows['7d'].key)}>
            {timeWindows['7d'].label}
            <DropdownMenuShortcut>
              {timeWindows['7d'].shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onChange(timeWindows['30d'].key)}>
            {timeWindows['30d'].label}
            <DropdownMenuShortcut>
              {timeWindows['30d'].shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onChange(timeWindows['6m'].key)}>
            {timeWindows['6m'].label}
            <DropdownMenuShortcut>
              {timeWindows['6m'].shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onChange(timeWindows['12m'].key)}>
            {timeWindows['12m'].label}
            <DropdownMenuShortcut>
              {timeWindows['12m'].shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() => onChange(timeWindows.monthToDate.key)}
          >
            {timeWindows.monthToDate.label}
            <DropdownMenuShortcut>
              {timeWindows.monthToDate.shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onChange(timeWindows.lastMonth.key)}>
            {timeWindows.lastMonth.label}
            <DropdownMenuShortcut>
              {timeWindows.lastMonth.shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() => onChange(timeWindows.yearToDate.key)}
          >
            {timeWindows.yearToDate.label}
            <DropdownMenuShortcut>
              {timeWindows.yearToDate.shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onChange(timeWindows.lastYear.key)}>
            {timeWindows.lastYear.label}
            <DropdownMenuShortcut>
              {timeWindows.lastYear.shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <div
            className="flex items-center gap-2 px-2 py-1.5"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <span className="text-sm whitespace-nowrap">Last</span>
            <Input
              type="number"
              min={1}
              max={365}
              placeholder="X"
              value={customDays}
              onChange={(e) => setCustomDays(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const days = Number.parseInt(customDays, 10);
                  if (days >= 1 && days <= 365) {
                    handleCustomDays(days);
                    setCustomDays('');
                  }
                }
                e.stopPropagation();
              }}
              className="h-7 w-16 text-center"
            />
            <span className="text-sm whitespace-nowrap">days</span>
          </div>
          <DropdownMenuItem onClick={() => handleCustom()}>
            {timeWindows.custom.label}
            <DropdownMenuShortcut>
              {timeWindows.custom.shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
