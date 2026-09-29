// @openpanel/db's clickhouse/client.ts owns these, but importing it constructs
// a client and a pino logger at import time (see insight.service.ts's header),
// and the fragment builders here must stay pure and synchronous. Same choice
// cohort.service.ts made for its table map.

const CLICKHOUSE_DATE_SUFFIX = /(\.\d{3})?Z+$/;

/** `YYYY-MM-DD HH:mm:ss` in UTC — the ClickHouse date literal format. */
export function formatClickhouseDate(date: Date | string): string {
  return new Date(date)
    .toISOString()
    .replace('T', ' ')
    .replace(CLICKHOUSE_DATE_SUFFIX, '');
}

export function convertClickhouseDateToJs(date: string): Date {
  return new Date(`${date.replace(' ', 'T')}Z`);
}
