import type { IChartRange } from '@openpanel/core/modules/report/report.constants';
import {
  addDays,
  addMonths,
  addYears,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  endOfDay,
  endOfMonth,
  endOfYear,
  format,
  isSameDay,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths,
  subYears,
} from 'date-fns';

export const DATE_TIME_FORMAT = 'yyyy-MM-dd HH:mm:ss';

const MINUTES_30 = 30;
const MINUTES_60 = 60;
const MINUTES_24H = 24 * 60;

/**
 * The concrete window a range stands for, in the browser's timezone, and the
 * calendar unit it is counted in. `size` is how many units the window spans,
 * which is how far a step moves it.
 */
export interface TimeWindowBounds {
  start: Date;
  end: Date;
  unit: 'minute' | 'day' | 'month' | 'year';
  size: number;
}

export type StepDirection = 'previous' | 'next';

function minuteWindow(now: Date, minutes: number): TimeWindowBounds {
  return {
    start: new Date(now.getTime() - minutes * 60_000),
    end: now,
    unit: 'minute',
    size: minutes,
  };
}

function dayWindow(start: Date, end: Date): TimeWindowBounds {
  return {
    start: startOfDay(start),
    end: endOfDay(end),
    unit: 'day',
    size: differenceInCalendarDays(end, start) + 1,
  };
}

function isStartOfDay(date: Date): boolean {
  return date.getTime() === startOfDay(date).getTime();
}

// Stored boundaries carry whole seconds, so compare without milliseconds.
function isEndOfDay(date: Date): boolean {
  return format(date, 'HH:mm:ss') === '23:59:59';
}

function boundsFromCustomDates(start: Date, rawEnd: Date): TimeWindowBounds {
  // An exclusive midnight end ("2026-10-24 00:00:00") means the whole previous day.
  const endsAtMidnight = isStartOfDay(rawEnd) && !isSameDay(start, rawEnd);
  const end = endsAtMidnight ? endOfDay(subDays(rawEnd, 1)) : rawEnd;

  const isWholeDays = isStartOfDay(start) && isEndOfDay(end);
  if (!isWholeDays) {
    const minutes = Math.round((end.getTime() - start.getTime()) / 60_000);
    return { start, end, unit: 'minute', size: Math.max(minutes, 1) };
  }

  const isWholeMonths =
    isSameDay(start, startOfMonth(start)) && isSameDay(end, endOfMonth(end));
  if (isWholeMonths) {
    return {
      start,
      end,
      unit: 'month',
      size: differenceInCalendarMonths(end, start) + 1,
    };
  }

  return dayWindow(start, end);
}

/**
 * Mirrors `getDatesFromRange` in `packages/core` for the browser, so the
 * trigger can show real dates and the stepper can move from what is on screen.
 */
export function resolveTimeWindow(
  range: IChartRange,
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  now = new Date()
): TimeWindowBounds {
  if (startDate && endDate) {
    return boundsFromCustomDates(parseISO(startDate), parseISO(endDate));
  }

  switch (range) {
    case '30min':
      return minuteWindow(now, MINUTES_30);
    case 'lastHour':
      return minuteWindow(now, MINUTES_60);
    case 'last24h':
      return minuteWindow(now, MINUTES_24H);
    case 'today':
      return dayWindow(now, now);
    case 'yesterday': {
      const yesterday = subDays(now, 1);
      return dayWindow(yesterday, yesterday);
    }
    case '7d':
      return dayWindow(subDays(now, 7), now);
    case '3m':
      return {
        start: startOfDay(subMonths(now, 3)),
        end: endOfDay(now),
        unit: 'month',
        size: 3,
      };
    case '6m':
      return {
        start: startOfDay(subMonths(now, 6)),
        end: endOfDay(now),
        unit: 'month',
        size: 6,
      };
    case '12m': {
      const start = startOfMonth(subMonths(now, 12));
      const end = endOfMonth(now);
      return {
        start,
        end,
        unit: 'month',
        size: differenceInCalendarMonths(end, start) + 1,
      };
    }
    case 'monthToDate':
      return {
        start: startOfMonth(now),
        end: endOfDay(now),
        unit: 'month',
        size: 1,
      };
    case 'lastMonth': {
      const month = subMonths(now, 1);
      return {
        start: startOfMonth(month),
        end: endOfMonth(month),
        unit: 'month',
        size: 1,
      };
    }
    case 'yearToDate':
      return {
        start: startOfYear(now),
        end: endOfDay(now),
        unit: 'year',
        size: 1,
      };
    case 'lastYear': {
      const year = subYears(now, 1);
      return {
        start: startOfYear(year),
        end: endOfYear(year),
        unit: 'year',
        size: 1,
      };
    }
    default:
      return dayWindow(subDays(now, 30), now);
  }
}

function shiftDate(
  date: Date,
  unit: TimeWindowBounds['unit'],
  amount: number
): Date {
  switch (unit) {
    case 'minute':
      return new Date(date.getTime() + amount * 60_000);
    case 'day':
      return addDays(date, amount);
    case 'month':
      return addMonths(date, amount);
    default:
      return addYears(date, amount);
  }
}

/**
 * Moves the window one whole length back or forward. A month- or year-aligned
 * end stays pinned to the end of its month/year so "last month" steps to a
 * full month, not to a month minus a day.
 */
export function stepTimeWindow(
  bounds: TimeWindowBounds,
  direction: StepDirection
): TimeWindowBounds {
  const amount = direction === 'next' ? bounds.size : -bounds.size;
  const start = shiftDate(bounds.start, bounds.unit, amount);
  let end = shiftDate(bounds.end, bounds.unit, amount);
  if (
    bounds.unit === 'month' &&
    isSameDay(bounds.end, endOfMonth(bounds.end))
  ) {
    end = endOfMonth(end);
  }
  if (bounds.unit === 'year' && isSameDay(bounds.end, endOfYear(bounds.end))) {
    end = endOfYear(end);
  }
  return { ...bounds, start, end };
}

/** A window that starts after now has no data yet, so there is nothing to step to. */
export function canStepTimeWindow(
  bounds: TimeWindowBounds,
  direction: StepDirection,
  now = new Date()
): boolean {
  if (direction === 'previous') {
    return true;
  }
  return stepTimeWindow(bounds, direction).start.getTime() <= now.getTime();
}

export function formatTimeWindowBoundary(date: Date): string {
  return format(date, DATE_TIME_FORMAT);
}
