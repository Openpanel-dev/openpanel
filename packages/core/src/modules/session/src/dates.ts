// @openpanel/db's clickhouse/client.ts owns these, but importing it constructs a
// client and a pino logger at import time, and the fragment builders here must stay
// pure and synchronous.

const CLICKHOUSE_DATE_SUFFIX = /(\.\d{3})?Z+$/;

/** `YYYY-MM-DD HH:mm:ss` in UTC — the date literal format ClickHouse expects. */
export function formatClickhouseDate(date: Date | string): string {
  return new Date(date)
    .toISOString()
    .replace('T', ' ')
    .replace(CLICKHOUSE_DATE_SUFFIX, '');
}

export function convertClickhouseDateToJs(date: string): Date {
  return new Date(`${date.replace(' ', 'T')}Z`);
}
