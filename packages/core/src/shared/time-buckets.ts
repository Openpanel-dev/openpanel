// `WITH FILL` turns a compact (startDate, endDate, interval) into one row per
// bucket, and the API buffers every row, so a time series' bucket count is
// checked before its statement is built.

import { convertClickhouseDateToJs, toRangeBoundaryLiteral } from './ch-dates';
import { BadRequestError } from './errors';
import { MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE } from './time.constants';

export type TimeBucketInterval = 'minute' | 'hour' | 'day' | 'week' | 'month';

/** Hourly over two years or by the minute over two weeks: past any readable chart. */
export const MAX_TIME_BUCKETS = 20_000;

const SHORTEST_MONTH_DAYS = 28;

// A month counts as its shortest length so the estimate never undercounts.
const INTERVAL_MS: Record<TimeBucketInterval, number> = {
  minute: MS_PER_MINUTE,
  hour: MS_PER_HOUR,
  day: MS_PER_DAY,
  week: 7 * MS_PER_DAY,
  month: SHORTEST_MONTH_DAYS * MS_PER_DAY,
};

// ClickHouse `DateTime` ends in 2106 and starts at the epoch; past either end
// a boundary wraps, so the statement would fill a range other than the one
// counted here.
const EARLIEST_DATE_MS = 0;
const LATEST_DATE_MS = Date.UTC(2106, 0, 1);

export class TimeRangeError extends BadRequestError {
  constructor(message: string) {
    super(message);
    this.name = 'TimeRangeError';
  }
}

function boundaryTime(value: string, boundary: 'start' | 'end'): number {
  if (Number.isNaN(new Date(value).getTime())) {
    throw new TimeRangeError(`Invalid ${boundary} date: ${value}`);
  }
  const time = convertClickhouseDateToJs(
    toRangeBoundaryLiteral(value, boundary)
  ).getTime();
  const isSupported =
    !Number.isNaN(time) && time >= EARLIEST_DATE_MS && time < LATEST_DATE_MS;
  if (!isSupported) {
    throw new TimeRangeError(
      `The ${boundary} date ${value} is outside the supported range (1970 to 2105).`
    );
  }
  return time;
}

export interface TimeBucketRange {
  startDate: string;
  endDate: string;
  interval: TimeBucketInterval;
}

/** Buckets spanned by the range, either way round; rejects unusable dates. */
export function countTimeBuckets({
  startDate,
  endDate,
  interval,
}: TimeBucketRange): number {
  const span = Math.abs(
    boundaryTime(endDate, 'end') - boundaryTime(startDate, 'start')
  );
  return Math.floor(span / INTERVAL_MS[interval]) + 1;
}

export function assertTimeBucketBudget(range: TimeBucketRange): void {
  const bucketCount = countTimeBuckets(range);
  if (bucketCount > MAX_TIME_BUCKETS) {
    throw new TimeRangeError(
      `The selected range splits into ${bucketCount} ${range.interval} intervals, more than the ${MAX_TIME_BUCKETS} supported. Pick a coarser interval or a shorter range.`
    );
  }
}
