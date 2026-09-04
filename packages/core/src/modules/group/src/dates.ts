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
