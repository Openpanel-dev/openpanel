// The two date helpers that read the report vocabulary. Split out of
// `shared/date.ts` at M15-009 (ADR-022 R22): they take `IChartRange` /
// `IReportInput`, which are this module's own constants, so a file in the
// bottom layer could not hold them. The generic Date/Luxon math they build on
// stays in `shared/date.ts`.

import { DateTime } from '@openpanel/shared';
import type { IChartRange, IReportInput } from '../report.constants';

const FALLBACK_TIMEZONE = 'UTC';

// Luxon renders "Invalid DateTime" for an unknown zone, which then reaches
// ClickHouse as a date literal; fall back rather than poison every query.
function usableTimezone(timezone: string): string {
  return DateTime.now().setZone(timezone).isValid
    ? timezone
    : FALLBACK_TIMEZONE;
}

export function getDatesFromRange(
  range: IChartRange,
  requestedTimezone: string
) {
  const timezone = usableTimezone(requestedTimezone);
  if (range === '30min' || range === 'lastHour') {
    const minutes = range === '30min' ? 30 : 60;
    const startDate = DateTime.now()
      .minus({ minute: minutes })
      .startOf('minute')
      .setZone(timezone)
      .toFormat('yyyy-MM-dd HH:mm:ss');
    const endDate = DateTime.now()
      .setZone(timezone)
      .endOf('minute')
      .toFormat('yyyy-MM-dd HH:mm:ss');

    return {
      startDate,
      endDate,
    };
  }

  if (range === 'last24h') {
    const startDate = DateTime.now()
      .minus({ hour: 24 })
      .startOf('minute')
      .setZone(timezone)
      .toFormat('yyyy-MM-dd HH:mm:ss');
    const endDate = DateTime.now()
      .setZone(timezone)
      .endOf('minute')
      .toFormat('yyyy-MM-dd HH:mm:ss');

    return {
      startDate,
      endDate,
    };
  }

  if (range === 'today') {
    const startDate = DateTime.now()
      .setZone(timezone)
      .startOf('day')
      .toFormat('yyyy-MM-dd HH:mm:ss');
    const endDate = DateTime.now()
      .setZone(timezone)
      .endOf('day')
      .toFormat('yyyy-MM-dd HH:mm:ss');

    return {
      startDate,
      endDate,
    };
  }

  if (range === 'yesterday') {
    const startDate = DateTime.now()
      .minus({ day: 1 })
      .setZone(timezone)
      .startOf('day')
      .toFormat('yyyy-MM-dd HH:mm:ss');
    const endDate = DateTime.now()
      .minus({ day: 1 })
      .setZone(timezone)
      .endOf('day')
      .toFormat('yyyy-MM-dd HH:mm:ss');
    return {
      startDate,
      endDate,
    };
  }

  if (range === '7d') {
    const startDate = DateTime.now()
      .minus({ day: 7 })
      .setZone(timezone)
      .startOf('day')
      .toFormat('yyyy-MM-dd HH:mm:ss');
    const endDate = DateTime.now()
      .setZone(timezone)
      .endOf('day')
      .plus({ millisecond: 1 })
      .toFormat('yyyy-MM-dd HH:mm:ss');

    return {
      startDate,
      endDate,
    };
  }

  if (range === '3m') {
    const startDate = DateTime.now()
      .minus({ month: 3 })
      .setZone(timezone)
      .startOf('day')
      .toFormat('yyyy-MM-dd HH:mm:ss');
    const endDate = DateTime.now()
      .setZone(timezone)
      .endOf('day')
      .plus({ millisecond: 1 })
      .toFormat('yyyy-MM-dd HH:mm:ss');

    return {
      startDate,
      endDate,
    };
  }

  if (range === '6m') {
    const startDate = DateTime.now()
      .minus({ month: 6 })
      .setZone(timezone)
      .startOf('day')
      .toFormat('yyyy-MM-dd HH:mm:ss');
    const endDate = DateTime.now()
      .setZone(timezone)
      .endOf('day')
      .plus({ millisecond: 1 })
      .toFormat('yyyy-MM-dd HH:mm:ss');

    return {
      startDate,
      endDate,
    };
  }

  if (range === '12m') {
    const startDate = DateTime.now()
      .minus({ month: 12 })
      .setZone(timezone)
      .startOf('month')
      .toFormat('yyyy-MM-dd HH:mm:ss');
    const endDate = DateTime.now()
      .setZone(timezone)
      .endOf('month')
      .plus({ millisecond: 1 })
      .toFormat('yyyy-MM-dd HH:mm:ss');

    return {
      startDate,
      endDate,
    };
  }

  if (range === 'monthToDate') {
    const startDate = DateTime.now()
      .setZone(timezone)
      .startOf('month')
      .toFormat('yyyy-MM-dd HH:mm:ss');
    const endDate = DateTime.now()
      .setZone(timezone)
      .endOf('day')
      .plus({ millisecond: 1 })
      .toFormat('yyyy-MM-dd HH:mm:ss');

    return {
      startDate,
      endDate,
    };
  }

  if (range === 'lastMonth') {
    const month = DateTime.now()
      .minus({ month: 1 })
      .setZone(timezone)
      .startOf('month');

    const startDate = month.toFormat('yyyy-MM-dd HH:mm:ss');
    const endDate = month
      .endOf('month')
      .plus({ millisecond: 1 })
      .toFormat('yyyy-MM-dd HH:mm:ss');

    return {
      startDate,
      endDate,
    };
  }

  if (range === 'yearToDate') {
    const startDate = DateTime.now()
      .setZone(timezone)
      .startOf('year')
      .toFormat('yyyy-MM-dd HH:mm:ss');
    const endDate = DateTime.now()
      .setZone(timezone)
      .endOf('day')
      .plus({ millisecond: 1 })
      .toFormat('yyyy-MM-dd HH:mm:ss');

    return {
      startDate,
      endDate,
    };
  }

  if (range === 'lastYear') {
    const year = DateTime.now().minus({ year: 1 }).setZone(timezone);
    const startDate = year.startOf('year').toFormat('yyyy-MM-dd HH:mm:ss');
    const endDate = year.endOf('year').toFormat('yyyy-MM-dd HH:mm:ss');

    return {
      startDate,
      endDate,
    };
  }

  // range === '30d'
  const startDate = DateTime.now()
    .minus({ day: 30 })
    .setZone(timezone)
    .startOf('day')
    .toFormat('yyyy-MM-dd HH:mm:ss');
  const endDate = DateTime.now()
    .setZone(timezone)
    .endOf('day')
    .plus({ millisecond: 1 })
    .toFormat('yyyy-MM-dd HH:mm:ss');

  return {
    startDate,
    endDate,
  };
}

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function normalizeBoundary(value: string, boundary: 'start' | 'end'): string {
  if (DATE_ONLY_REGEX.test(value)) {
    return boundary === 'start' ? `${value} 00:00:00` : `${value} 23:59:59`;
  }
  return value;
}

export function getChartStartEndDate(
  {
    startDate,
    endDate,
    range,
  }: Pick<IReportInput, 'endDate' | 'startDate' | 'range'>,
  timezone: string
) {
  const normalizedStart = startDate
    ? normalizeBoundary(startDate, 'start')
    : startDate;
  const normalizedEnd = endDate ? normalizeBoundary(endDate, 'end') : endDate;

  if (normalizedStart && normalizedEnd) {
    return { startDate: normalizedStart, endDate: normalizedEnd };
  }

  const ranges = getDatesFromRange(range, timezone);
  if (!normalizedStart && normalizedEnd) {
    return { startDate: ranges.startDate, endDate: normalizedEnd };
  }

  return ranges;
}
