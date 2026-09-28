// ClickHouse's date literal format, shared across modules.
//
// `@openpanel/db/src/clickhouse/client.ts` owns these too, but importing it
// constructs a real ClickHouse client and a real pino logger at module load and
// is a value import of `@openpanel/db` from core — see ch-tables.ts's header
// for the full reasoning. Five modules already carry a byte-identical private
// copy in their own `src/dates.ts` (chart, event, group, profile, session).
// `ch-dates.parity.test.ts` asserts this file and @openpanel/db's agree on
// every input, so the copy cannot drift silently.

const CLICKHOUSE_DATE_SUFFIX = /(\.\d{3})?Z+$/;

/**
 * `YYYY-MM-DD HH:mm:ss` in UTC. `skipTime` narrows it to `YYYY-MM-DD`, for
 * the date-only column comparisons the billing counters build.
 */
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
 * Two shapes reach the query builders. The dashboard sends
 * `YYYY-MM-DD HH:mm:ss` already widened to the day's edges by
 * `getChartStartEndDate`; the MCP tools send a bare `YYYY-MM-DD`. A bare date
 * names a whole DAY, so an end boundary has to widen to 23:59:59 — left at
 * midnight it drops the last day of every range.
 *
 * An already-ClickHouse-shaped literal is returned untouched rather than sent
 * through `new Date()`, which reads it in the server's local zone and shifts
 * it by the offset.
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
