// @openpanel/db's clickhouse/client.ts owns these, but importing it constructs a
// client and a pino logger at import time, and the fragment builders here must stay
// pure and synchronous.

const CLICKHOUSE_DATE_SUFFIX = /(\.\d{3})?Z+$/;

/** `YYYY-MM-DD HH:mm:ss` in UTC — ClickHouse's date literal format. */
export function formatClickhouseDate(date: Date | string): string {
  return new Date(date)
    .toISOString()
    .replace('T', ' ')
    .replace(CLICKHOUSE_DATE_SUFFIX, '');
}

/**
 * `YYYY-MM-DD HH:mm:ss.SSS` in UTC. `created_at` is DateTime64(3), so a bound
 * that went through `formatClickhouseDate` would lose the millisecond and
 * could in/exclude events inside the same truncated second.
 */
export function formatClickhouseDateTime64(date: Date | string): string {
  return new Date(date).toISOString().replace('T', ' ').replace('Z', '');
}

export function convertClickhouseDateToJs(date: string): Date {
  return new Date(`${date.replace(' ', 'T')}Z`);
}
