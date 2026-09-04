// @openpanel/db's clickhouse/client.ts builds a real client and a real pino
// logger (with a pino-pretty worker thread) the moment it is imported, and
// `createBuffers` sits on the curated barrel — a static import here would pay
// that once per `bun test --isolate` file. Same choice insight.service.ts and
// event.service.ts made, for the same reason. Resolved once per process; a
// flush pays one already-settled promise.

type ClickHouseModule = typeof import('@openpanel/db/src/clickhouse/client');

let pending: Promise<ClickHouseModule> | undefined;

export function loadClickHouse(): Promise<ClickHouseModule> {
  pending ??= import('@openpanel/db/src/clickhouse/client');
  return pending;
}
