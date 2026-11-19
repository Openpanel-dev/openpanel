import type {
  IChartRange,
  IInterval,
} from '@openpanel/core/modules/report/report.constants';
import {
  getDefaultIntervalByDates,
  timeWindows,
} from '@openpanel/core/modules/report/report.constants';
import { bind } from 'bind-event-listener';
import { endOfDay, isSameDay, startOfDay, subDays, subMonths } from 'date-fns';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { InputEnter } from '@/components/ui/input-enter';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { cn } from '@/utils/cn';
import { formatDate, formatDateTime } from '@/utils/date';
import { shouldIgnoreKeypress } from '@/utils/should-ignore-keypress';
import {
  canStepTimeWindow,
  formatTimeWindowBoundary,
  resolveTimeWindow,
  type StepDirection,
  stepTimeWindow,
  type TimeWindowBounds,
} from '@/utils/time-window';

const MAX_CUSTOM_DAYS = 365;
const DESKTOP_MONTHS = 2;
const MOBILE_MONTHS = 1;
const COLLISION_PADDING = 16;

const PRESET_GROUPS: IChartRange[][] = [
  ['30min', 'lastHour', 'last24h'],
  ['today', 'yesterday', '7d', '30d'],
  ['3m', '6m', '12m'],
  ['monthToDate', 'lastMonth', 'yearToDate', 'lastYear'],
];

interface Props {
  value: IChartRange;
  onChange: (value: IChartRange) => void;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onIntervalChange: (interval: IInterval) => void;
  /** The interval in effect; stepping keeps it since the window length does not change. */
  interval?: IInterval | null;
  endDate: string | null;
  startDate: string | null;
  className?: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
}

function formatWindowLabel(bounds: TimeWindowBounds): string {
  if (bounds.unit === 'minute') {
    return `${formatDateTime(bounds.start)} – ${formatDateTime(bounds.end)}`;
  }
  if (isSameDay(bounds.start, bounds.end)) {
    return formatDate(bounds.start);
  }
  return `${formatDate(bounds.start)} – ${formatDate(bounds.end)}`;
}

export function TimeWindowPicker({
  value,
  onChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  onIntervalChange,
  interval,
  className,
  variant = 'outline',
  size,
}: Props) {
  const { isBelowSm } = useBreakpoint('sm');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>();
  const [customDaysKey, setCustomDaysKey] = useState(0);

  const isCustom = value === 'custom';
  const bounds = useMemo(
    () => resolveTimeWindow(value, startDate, endDate),
    [value, startDate, endDate]
  );
  const triggerLabel = isCustom
    ? formatWindowLabel(bounds)
    : timeWindows[value]?.label;

  const applyBounds = useCallback(
    (next: TimeWindowBounds, nextInterval: IInterval | null | undefined) => {
      onStartDateChange(formatTimeWindowBoundary(next.start));
      onEndDateChange(formatTimeWindowBoundary(next.end));
      onChange('custom');
      const resolvedInterval =
        nextInterval ??
        getDefaultIntervalByDates(
          next.start.toISOString(),
          next.end.toISOString()
        );
      if (resolvedInterval) {
        onIntervalChange(resolvedInterval);
      }
    },
    [onChange, onStartDateChange, onEndDateChange, onIntervalChange]
  );

  // Radix only reports its own dismissals, so every close path drops the draft here.
  const close = useCallback(() => {
    setDraft(undefined);
    setOpen(false);
  }, []);

  const selectPreset = useCallback(
    (range: IChartRange) => {
      onChange(range);
      close();
    },
    [onChange, close]
  );

  const applyDraft = useCallback(() => {
    if (!(draft?.from && draft.to)) {
      return;
    }
    applyBounds(
      {
        start: startOfDay(draft.from),
        end: endOfDay(draft.to),
        unit: 'day',
        size: 0,
      },
      null
    );
    close();
  }, [draft, applyBounds, close]);

  const applyCustomDays = useCallback(
    (raw: string) => {
      const days = Number(raw);
      if (!Number.isInteger(days) || days < 1 || days > MAX_CUSTOM_DAYS) {
        return;
      }
      const now = new Date();
      applyBounds(
        {
          start: startOfDay(subDays(now, days - 1)),
          end: endOfDay(now),
          unit: 'day',
          size: days,
        },
        null
      );
      setCustomDaysKey((key) => key + 1);
      close();
    },
    [applyBounds, close]
  );

  const step = useCallback(
    (direction: StepDirection) => {
      applyBounds(stepTimeWindow(bounds, direction), interval);
    },
    [bounds, interval, applyBounds]
  );

  useEffect(() => {
    return bind(document, {
      type: 'keydown',
      listener(event) {
        if (shouldIgnoreKeypress(event)) {
          return;
        }
        const match = Object.values(timeWindows).find(
          (window) => event.key === window.shortcut.toLowerCase()
        );
        if (!match) {
          return;
        }
        if (match.key === 'custom') {
          setOpen(true);
          return;
        }
        selectPreset(match.key);
      },
    });
  }, [selectPreset]);

  const selectedRange: DateRange | undefined = draft ?? {
    from: bounds.start,
    to: bounds.end,
  };
  const canApply = Boolean(draft?.from && draft?.to);
  const canStepNext = canStepTimeWindow(bounds, 'next');
  const stepperSize = size === 'sm' ? 'sm' : 'default';

  return (
    <div className="flex items-center gap-1">
      <Popover
        onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : close())}
        open={open}
      >
        <PopoverTrigger asChild>
          <Button
            className={cn('justify-start', className)}
            icon={CalendarIcon}
            size={size}
            variant={variant}
          >
            {triggerLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="max-h-(--radix-popover-content-available-height) w-auto max-w-[calc(100vw-2rem)] overflow-y-auto p-0"
          collisionPadding={COLLISION_PADDING}
          portal
        >
          <div className="flex flex-col sm:flex-row">
            <div className="col gap-2 border-b p-2 sm:w-44 sm:border-r sm:border-b-0">
              <div className="flex items-center gap-2 px-2 pt-1">
                <span className="text-muted-foreground text-sm">Last</span>
                <InputEnter
                  aria-label="Number of days"
                  className="h-7 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  inputMode="numeric"
                  key={customDaysKey}
                  max={MAX_CUSTOM_DAYS}
                  min={1}
                  onChangeValue={applyCustomDays}
                  placeholder="N"
                  step={1}
                  type="number"
                  value=""
                />
                <span className="text-muted-foreground text-sm">days</span>
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 sm:flex sm:flex-col">
                {PRESET_GROUPS.map((group) => (
                  <div className="col" key={group[0]}>
                    {group.map((range) => {
                      const preset = timeWindows[range];
                      const isActive = value === range;
                      return (
                        <button
                          className={cn(
                            'flex h-7 items-center justify-between rounded-md px-2 text-left text-sm hover:bg-accent hover:text-accent-foreground',
                            isActive && 'bg-accent font-medium'
                          )}
                          key={range}
                          onClick={() => selectPreset(range)}
                          type="button"
                        >
                          <span>{preset.label}</span>
                          <kbd
                            aria-hidden
                            className="hidden rounded border border-border bg-def-200 px-1 font-mono text-2xs text-muted-foreground sm:inline"
                          >
                            {preset.shortcut}
                          </kbd>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            <div className="col justify-between gap-3 p-3">
              <Calendar
                captionLayout="dropdown"
                className="p-0"
                defaultMonth={subMonths(
                  bounds.start,
                  isBelowSm ? 0 : DESKTOP_MONTHS - 1
                )}
                disabled={{ after: endOfDay(new Date()) }}
                mode="range"
                numberOfMonths={isBelowSm ? MOBILE_MONTHS : DESKTOP_MONTHS}
                onSelect={(range, day) => {
                  // The current window is shown for orientation; the first
                  // click starts a new pick instead of stretching it.
                  setDraft(draft ? range : { from: day, to: undefined });
                }}
                selected={selectedRange}
              />
              <div className="flex items-center justify-between gap-4 border-t pt-3">
                <span className="text-muted-foreground text-sm">
                  {draft?.from
                    ? formatWindowLabel({
                        start: draft.from,
                        end: draft.to ?? draft.from,
                        unit: 'day',
                        size: 0,
                      })
                    : formatWindowLabel(bounds)}
                </span>
                <div className="flex gap-2">
                  <Button
                    onClick={close}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={!canApply}
                    onClick={applyDraft}
                    size="sm"
                    type="button"
                  >
                    Apply
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      <div className="hidden items-center sm:flex">
        <Button
          aria-label="Previous period"
          className={cn(className, 'rounded-r-none px-2')}
          onClick={() => step('previous')}
          size={stepperSize}
          type="button"
          variant={variant}
        >
          <ChevronLeftIcon className="size-4" />
        </Button>
        <Button
          aria-label="Next period"
          className={cn(className, '-ml-px rounded-l-none px-2')}
          disabled={!canStepNext}
          onClick={() => step('next')}
          size={stepperSize}
          type="button"
          variant={variant}
        >
          <ChevronRightIcon className="size-4" />
        </Button>
      </div>
    </div>
  );
}
