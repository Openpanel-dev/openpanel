// ClickHouse's date literal format. Duplicated from `@openpanel/db` because
// importing it constructs a real ClickHouse client at module load;
// `ch-dates.parity.test.ts` asserts the two agree on every input.

const CLICKHOUSE_DATE_SUFFIX = /(\.\d{3})?Z+$/;

/** `YYYY-MM-DD HH:mm:ss` in UTC; `skipTime` narrows it to `YYYY-MM-DD`. */
export function formatClickhouseDate(
  date: Date | string,
  skipTime = false
): string {
  if (skipTime) {
    return new Date(date).toISOString().split('T')[0]!;
  }
  return new Date(date)
    .toISOString()
    .replace('T', ' ')
    .replace(CLICKHOUSE_DATE_SUFFIX, '');
}

export function convertClickhouseDateToJs(date: string): Date {
  return new Date(`${date.replace(' ', 'T')}Z`);
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const CLICKHOUSE_DATE_TIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

const START_OF_DAY = '00:00:00';
const END_OF_DAY = '23:59:59';

/**
 * A range boundary as a ClickHouse `DateTime` literal.
 *
 * The dashboard sends `YYYY-MM-DD HH:mm:ss` already widened to the day's edges;
 * the MCP tools send a bare `YYYY-MM-DD`, which names a whole DAY, so an end
 * boundary must widen to 23:59:59 or the last day of every range is dropped.
 *
 * An already-ClickHouse-shaped literal is returned untouched: `new Date()`
 * would read it in the server's local zone and shift it by the offset.
 */
export function toRangeBoundaryLiteral(
  value: string,
  boundary: 'start' | 'end'
): string {
  if (DATE_ONLY.test(value)) {
    return `${value} ${boundary === 'start' ? START_OF_DAY : END_OF_DAY}`;
  }
  if (CLICKHOUSE_DATE_TIME.test(value)) {
    return value;
  }
  return formatClickhouseDate(value);
}

/** The same boundary narrowed to `YYYY-MM-DD`, for `Date`-typed columns. */
export function toRangeBoundaryDate(
  value: string,
  boundary: 'start' | 'end'
): string {
  return toRangeBoundaryLiteral(value, boundary).slice(0, 10);
}
