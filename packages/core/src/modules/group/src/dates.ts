// @openpanel/db's clickhouse/client.ts owns this, but importing it constructs
// a client and a pino logger at import time (see insight.service.ts's header).
// Same copy session/src/dates.ts carries.

const CLICKHOUSE_DATE_SUFFIX = /(\.\d{3})?Z+$/;

/** `YYYY-MM-DD HH:mm:ss` in UTC — what V1 sent as a date literal. */
export function formatClickhouseDate(date: Date | string): string {
  return new Date(date)
    .toISOString()
    .replace('T', ' ')
    .replace(CLICKHOUSE_DATE_SUFFIX, '');
}

export function convertClickhouseDateToJs(date: string): Date {
  return new Date(`${date.replace(' ', 'T')}Z`);
}

const ROLLUP_DATE_PREFIX = '1970-01-01';
const ROLLUP_DATE_PREFIX_ALT = '1969-12-31';

/** ClickHouse's zero date for a metric no row ever populated. */
export function toNullIfDefaultMinDate(date?: string | null): Date | null {
  if (!date) {
    return null;
  }
  return date.startsWith(ROLLUP_DATE_PREFIX) ||
    date.startsWith(ROLLUP_DATE_PREFIX_ALT)
    ? null
    : convertClickhouseDateToJs(date);
}
