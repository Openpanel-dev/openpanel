// Generic date helpers (ADR-007 shared/ layout: "date"). Pure Date/Luxon math,
// no ClickHouse or Postgres access.
//
// `DateTime` and `getTime` moved here from packages/common/src/date.ts, which
// was the workspace's only luxon declaration. This file is now the one place
// core re-exports luxon's DateTime from.
//
// `getDatesFromRange` and `getChartStartEndDate` left with the report
// vocabulary they read (`IChartRange`, `IReportInput`) — they are
// `packages/core/src/modules/report/src/chart-dates.ts` now.
//
// What was left knows nothing above it and nothing about the domain, so it is
// @openpanel/shared's.
import { DateTime } from 'luxon';

export { DateTime } from 'luxon';

export function getTime(date: string | number | Date) {
  return new Date(date).getTime();
}

export function resolveDateRange(
  startDate?: string,
  endDate?: string
): { startDate: string; endDate: string } {
  const end = endDate ?? new Date().toISOString().slice(0, 10);
  const start =
    startDate ??
    new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  return { startDate: start, endDate: end };
}

export function getChartPrevStartEndDate({
  startDate,
  endDate,
}: {
  startDate: string;
  endDate: string;
}) {
  let diff = DateTime.fromFormat(endDate, 'yyyy-MM-dd HH:mm:ss').diff(
    DateTime.fromFormat(startDate, 'yyyy-MM-dd HH:mm:ss')
  );

  if ((diff.milliseconds / 1000) % 2 !== 0) {
    diff = diff.plus({ millisecond: 1 });
  }

  return {
    startDate: DateTime.fromFormat(startDate, 'yyyy-MM-dd HH:mm:ss')
      .minus({ millisecond: diff.milliseconds })
      .toFormat('yyyy-MM-dd HH:mm:ss'),
    endDate: DateTime.fromFormat(endDate, 'yyyy-MM-dd HH:mm:ss')
      .minus({ millisecond: diff.milliseconds })
      .toFormat('yyyy-MM-dd HH:mm:ss'),
  };
}
