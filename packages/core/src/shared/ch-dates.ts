// ClickHouse's date literal format, shared across modules.
//
// M10-009: `@openpanel/db/src/clickhouse/client.ts` owns these too, but
// importing it constructs a real ClickHouse client and a real pino logger at
// module load and is a value import of `@openpanel/db` from core — see
// ch-tables.ts's header for the full reasoning. Five modules already carry a
// byte-identical private copy in their own `src/dates.ts` (chart, event,
// group, profile, session); folding those into this file is its own task, not
// this one's. `ch-dates.parity.test.ts` asserts this file and @openpanel/db's
// agree on every input, so the copy cannot drift silently.

const CLICKHOUSE_DATE_SUFFIX = /(\.\d{3})?Z+$/;

/**
 * `YYYY-MM-DD HH:mm:ss` in UTC — what V1 sent as a date literal.
 * `skipTime` narrows it to `YYYY-MM-DD`, for the date-only column comparisons
 * the billing counters build.
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
