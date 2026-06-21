import { getDefaultIntervalByDates, timeWindows } from '@openpanel/constants';
import type { IChartRange, IInterval } from '@openpanel/validation';
import { bind } from 'bind-event-listener';
import { addDays, endOfDay, format, startOfDay, subDays } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { InputEnter } from '@/components/ui/input-enter';
import { pushModal, useOnPushModal } from '@/modals';
import { cn } from '@/utils/cn';
import { shouldIgnoreKeypress } from '@/utils/should-ignore-keypress';

const timeWindowLabelKeys = {
  '30min': 'ui.time_window_30min',
  lastHour: 'ui.time_window_last_hour',
  last24h: 'ui.time_window_last_24h',
  today: 'ui.time_window_today',
  yesterday: 'ui.time_window_yesterday',
  '7d': 'ui.time_window_7d',
  '30d': 'ui.time_window_30d',
  '3m': 'ui.time_window_3m',
  '6m': 'ui.time_window_6m',
  '12m': 'ui.time_window_12m',
  monthToDate: 'ui.time_window_month_to_date',
  lastMonth: 'ui.time_window_last_month',
  yearToDate: 'ui.time_window_year_to_date',
  lastYear: 'ui.time_window_last_year',
  custom: 'ui.time_window_custom',
} satisfies Record<keyof typeof timeWindows, string>;

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
  const { t } = useTranslation();
  const isDateRangerPickerOpen = useRef(false);
  useOnPushModal('DateRangerPicker', (open) => {
    isDateRangerPickerOpen.current = open;
  });
  const timeWindow = timeWindows[value ?? '30d'];
  const getTimeWindowLabel = (key: keyof typeof timeWindows) =>
    t(timeWindowLabelKeys[key]);
  const [open, setOpen] = useState(false);
  const [customDaysKey, setCustomDaysKey] = useState(0);

  const handleCustomDays = useCallback(
    (raw: string) => {
      const days = Number(raw);
      if (!Number.isInteger(days) || days < 1 || days > 365) {
        return;
      }
      const now = new Date();
      const start = startOfDay(subDays(now, days - 1));
      const end = startOfDay(addDays(now, 1));
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
      setCustomDaysKey((k) => k + 1);
      setOpen(false);
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
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <Button
          className={cn('justify-start', className)}
          icon={CalendarIcon}
          variant="outline"
        >
          {timeWindow ? getTimeWindowLabel(timeWindow.key) : undefined}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>{t('ui.time_window')}</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => onChange(timeWindows['30min'].key)}>
            {getTimeWindowLabel(timeWindows['30min'].key)}
            <DropdownMenuShortcut>
              {timeWindows['30min'].shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onChange(timeWindows.lastHour.key)}>
            {getTimeWindowLabel(timeWindows.lastHour.key)}
            <DropdownMenuShortcut>
              {timeWindows.lastHour.shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onChange(timeWindows.last24h.key)}>
            {getTimeWindowLabel(timeWindows.last24h.key)}
            <DropdownMenuShortcut>
              {timeWindows.last24h.shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onChange(timeWindows.today.key)}>
            {getTimeWindowLabel(timeWindows.today.key)}
            <DropdownMenuShortcut>
              {timeWindows.today.shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onChange(timeWindows.yesterday.key)}>
            {getTimeWindowLabel(timeWindows.yesterday.key)}
            <DropdownMenuShortcut>
              {timeWindows.yesterday.shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => onChange(timeWindows['7d'].key)}>
            {getTimeWindowLabel(timeWindows['7d'].key)}
            <DropdownMenuShortcut>
              {timeWindows['7d'].shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onChange(timeWindows['30d'].key)}>
            {getTimeWindowLabel(timeWindows['30d'].key)}
            <DropdownMenuShortcut>
              {timeWindows['30d'].shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onChange(timeWindows['3m'].key)}>
            {getTimeWindowLabel(timeWindows['3m'].key)}
            <DropdownMenuShortcut>
              {timeWindows['3m'].shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onChange(timeWindows['6m'].key)}>
            {getTimeWindowLabel(timeWindows['6m'].key)}
            <DropdownMenuShortcut>
              {timeWindows['6m'].shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onChange(timeWindows['12m'].key)}>
            {getTimeWindowLabel(timeWindows['12m'].key)}
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
            {getTimeWindowLabel(timeWindows.monthToDate.key)}
            <DropdownMenuShortcut>
              {timeWindows.monthToDate.shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onChange(timeWindows.lastMonth.key)}>
            {getTimeWindowLabel(timeWindows.lastMonth.key)}
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
            {getTimeWindowLabel(timeWindows.yearToDate.key)}
            <DropdownMenuShortcut>
              {timeWindows.yearToDate.shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onChange(timeWindows.lastYear.key)}>
            {getTimeWindowLabel(timeWindows.lastYear.key)}
            <DropdownMenuShortcut>
              {timeWindows.lastYear.shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          {/** biome-ignore lint/a11y/noNoninteractiveElementInteractions: none */}
          {/** biome-ignore lint/a11y/noStaticElementInteractions: none */}
          <div
            className="flex items-center gap-4 rounded-sm px-2 py-1.5"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <span className="whitespace-nowrap">{t('ui.last_days')}</span>
            <InputEnter
              aria-label={t('ui.custom_date_filter_days_aria_label')}
              className="h-7 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              inputMode="numeric"
              key={customDaysKey}
              max={365}
              min={1}
              onChangeValue={handleCustomDays}
              placeholder={t('ui.x_days')}
              step={1}
              type="number"
              value=""
            />
          </div>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => handleCustom()}>
            {getTimeWindowLabel(timeWindows.custom.key)}
            <DropdownMenuShortcut>
              {timeWindows.custom.shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
