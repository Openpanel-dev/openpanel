import crypto from 'node:crypto';
import type { EventEmitter } from 'node:events';
import { createClient, formatClickhouseDate } from './client';

interface CreateTableOptions {
  name: string;
  columns: string[];
  indices?: string[];
  engine?: string;
  orderBy: string[];
  partitionBy?: string;
  settings?: Record<string, string | number>;
  distributionHash: string;
  replicatedVersion: string;
  isClustered: boolean;
}

interface CreateMaterializedViewOptions {
  name: string;
  tableName: string;
  query: string;
  engine?: string;
  orderBy: string[];
  partitionBy?: string;
  settings?: Record<string, string | number>;
  populate?: boolean;
  distributionHash: string;
  replicatedVersion: string;
  isClustered: boolean;
}

const CLUSTER_REPLICA_PATH =
  '/clickhouse/{installation}/{cluster}/tables/{shard}/openpanel/v{replicatedVersion}/{table}';

const replicated = (tableName: string) => `${tableName}_replicated`;

/**
 * The database the migrations create and query, from `CLICKHOUSE_URL`'s path the same way the
 * client resolves it, so an isolated database (a hub worktree's `openpanel_<name>`) migrates
 * into itself and not into `openpanel`.
 */
export function migrationDatabase(): string {
  const raw = (process.env.CLICKHOUSE_URL ?? '').split(',')[0]?.trim();
  if (!raw) {
    return 'openpanel';
  }
  try {
    const name = new URL(raw).pathname.replace(/^\/+|\/+$/g, '');
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : 'openpanel';
  } catch {
    return 'openpanel';
  }
}

export const chMigrationClient = createClient({
  url: process.env.CLICKHOUSE_URL,
  request_timeout: 3_600_000, // 1 hour in milliseconds
  keep_alive: {
    enabled: true,
  },
  compression: {
    request: true,
    response: true,
  },
  clickhouse_settings: {
    wait_end_of_query: 1,
    // Progress headers keep the connection active so long queries are not idled out by proxies.
    send_progress_in_http_headers: 1,
    // Under 60s, the usual proxy idle timeout.
    http_headers_progress_interval_ms: '50000',
  },
});

export function createDatabase(name: string, isClustered: boolean) {
  if (isClustered) {
    return `CREATE DATABASE IF NOT EXISTS ${name} ON CLUSTER '{cluster}'`;
  }

  return `CREATE DATABASE IF NOT EXISTS ${name}`;
}

/** Creates SQL statements for table creation, clustered or not. */
export function createTable({
  name: tableName,
  columns,
  indices = [],
  engine = 'MergeTree()',
  orderBy = ['tuple()'],
  partitionBy,
  settings = {},
  distributionHash,
  replicatedVersion,
  isClustered,
}: CreateTableOptions): string[] {
  const columnDefinitions = [...columns, ...indices].join(',\n  ');

  const settingsClause = Object.entries(settings).length
    ? `SETTINGS ${Object.entries(settings)
        .map(([key, value]) => `${key} = ${value}`)
        .join(', ')}`
    : '';

  const partitionByClause = partitionBy ? `PARTITION BY ${partitionBy}` : '';

  if (!isClustered) {
    return [
      `CREATE TABLE IF NOT EXISTS ${tableName} (
  ${columnDefinitions}
)
ENGINE = ${engine}
${partitionByClause}
ORDER BY (${orderBy.join(', ')})
${settingsClause}`.trim(),
    ];
  }

  return [
    `CREATE TABLE IF NOT EXISTS ${replicated(tableName)} ON CLUSTER '{cluster}' (
  ${columnDefinitions}
)
ENGINE = Replicated${engine.replace(/^(.+?)\((.+?)?\)/, `$1('${CLUSTER_REPLICA_PATH.replace('{replicatedVersion}', replicatedVersion)}', '{replica}', $2)`).replace(/, \)$/, ')')}
${partitionByClause}
ORDER BY (${orderBy.join(', ')})
${settingsClause}`.trim(),
    `CREATE TABLE IF NOT EXISTS ${tableName} ON CLUSTER '{cluster}' AS ${replicated(tableName)}
ENGINE = Distributed('{cluster}', currentDatabase(), ${replicated(tableName)}, ${distributionHash})`,
  ];
}

export const modifyTTL = ({
  tableName,
  isClustered,
  ttl,
}: {
  tableName: string;
  isClustered: boolean;
  ttl: string;
}) => {
  if (isClustered) {
    return `ALTER TABLE ${replicated(tableName)} ON CLUSTER '{cluster}' MODIFY TTL ${ttl}`;
  }

  return `ALTER TABLE ${tableName} MODIFY TTL ${ttl}`;
};

export function addColumns(
  tableName: string,
  columns: string[],
  isClustered: boolean
): string[] {
  if (isClustered) {
    return columns.flatMap((col) => [
      `ALTER TABLE ${replicated(tableName)} ON CLUSTER '{cluster}' ADD COLUMN IF NOT EXISTS ${col}`,
      `ALTER TABLE ${tableName} ON CLUSTER '{cluster}' ADD COLUMN IF NOT EXISTS ${col}`,
    ]);
  }

  return columns.map(
    (col) => `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${col}`
  );
}

export function dropColumns(
  tableName: string,
  columnNames: string[],
  isClustered: boolean
): string[] {
  if (isClustered) {
    return columnNames.flatMap((colName) => [
      `ALTER TABLE ${replicated(tableName)} ON CLUSTER '{cluster}' DROP COLUMN IF EXISTS ${colName}`,
      `ALTER TABLE ${tableName} ON CLUSTER '{cluster}' DROP COLUMN IF EXISTS ${colName}`,
    ]);
  }

  return columnNames.map(
    (colName) => `ALTER TABLE ${tableName} DROP COLUMN IF EXISTS ${colName}`
  );
}

export async function getExistingTables() {
  try {
    const existingTablesQuery = await chMigrationClient.query({
      query:
        'SELECT name FROM system.tables WHERE database = {database:String}',
      query_params: { database: migrationDatabase() },
      format: 'JSONEachRow',
    });
    return (await existingTablesQuery.json<{ name: string }>())
      .map((table) => table.name)
      .filter((table) => !table.includes('.inner_id'));
  } catch (e) {
    console.error(e);
    return [];
  }
}

export function renameTable({
  from,
  to,
  isClustered,
}: {
  from: string;
  to: string;
  isClustered: boolean;
}) {
  if (isClustered) {
    return [
      `RENAME TABLE ${replicated(from)} TO ${replicated(to)} ON CLUSTER '{cluster}'`,
      `RENAME TABLE ${from} TO ${to} ON CLUSTER '{cluster}'`,
    ];
  }

  return [`RENAME TABLE ${from} TO ${to}`];
}

export function dropTable(tableName: string, isClustered: boolean) {
  if (isClustered) {
    return `DROP TABLE IF EXISTS ${tableName} ON CLUSTER '{cluster}'`;
  }

  return `DROP TABLE IF EXISTS ${tableName}`;
}

export function moveDataBetweenTables({
  from,
  to,
  batch,
  columns,
}: {
  from: string;
  to: string;
  batch?: {
    column: string;
    interval?: 'day' | 'week' | 'month';
    transform?: (date: Date) => string;
    endDate?: Date;
    startDate?: Date;
  };
  columns?: string[];
}): string[] {
  const sqls: string[] = [];

  const selectClause = columns && columns.length > 0 ? columns.join(', ') : '*';

  if (!batch) {
    return [`INSERT INTO ${to} SELECT ${selectClause} FROM ${from}`];
  }

  // Default window: 3 years back from tomorrow, so today is included.
  const endDate = batch.endDate || new Date();
  if (!batch.endDate) {
    endDate.setDate(endDate.getDate() + 1);
  }
  const startDate = batch.startDate || new Date();
  if (!batch.startDate) {
    startDate.setFullYear(startDate.getFullYear() - 3);
  }

  let currentDate = endDate;
  const interval = batch.interval || 'day';

  const getWeekStart = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const shouldContinue = (
    current: Date,
    start: Date,
    intervalType: string
  ): boolean => {
    if (intervalType === 'month') {
      const currentYear = current.getFullYear();
      const currentMonth = current.getMonth();
      const startYear = start.getFullYear();
      const startMonth = start.getMonth();
      return (
        currentYear > startYear ||
        (currentYear === startYear && currentMonth >= startMonth)
      );
    }
    if (intervalType === 'week') {
      const currentWeekStart = getWeekStart(current);
      const startWeekStart = getWeekStart(start);
      return currentWeekStart >= startWeekStart;
    }
    return current > start;
  };

  while (shouldContinue(currentDate, startDate, interval)) {
    const previousDate = new Date(currentDate);

    switch (interval) {
      case 'month':
        previousDate.setMonth(previousDate.getMonth() - 1);
        // Clamp to the month containing startDate so it is still covered.
        if (
          previousDate.getFullYear() < startDate.getFullYear() ||
          (previousDate.getFullYear() === startDate.getFullYear() &&
            previousDate.getMonth() < startDate.getMonth())
        ) {
          previousDate.setFullYear(startDate.getFullYear());
          previousDate.setMonth(startDate.getMonth());
          previousDate.setDate(1);
        }
        break;
      case 'week': {
        previousDate.setDate(previousDate.getDate() - 7);
        const startWeekStart = getWeekStart(startDate);
        const prevWeekStart = getWeekStart(previousDate);
        if (prevWeekStart < startWeekStart) {
          previousDate.setTime(startWeekStart.getTime());
        }
        break;
      }
      default:
        previousDate.setDate(previousDate.getDate() - 1);
        break;
    }

    // The WHERE clause uses > previousDate AND <= upperBoundDate to get exactly one period.
    let upperBoundDate = currentDate;
    if (upperBoundDate > endDate) {
      upperBoundDate = endDate;
    }

    const sql = `INSERT INTO ${to} 
      SELECT ${selectClause} FROM ${from} 
      WHERE ${batch.column} > '${batch.transform ? batch.transform(previousDate) : formatClickhouseDate(previousDate, true)}' 
      AND ${batch.column} <= '${batch.transform ? batch.transform(upperBoundDate) : formatClickhouseDate(upperBoundDate, true)}'`;
    sqls.push(sql);

    if (interval === 'month') {
      const prevYear = previousDate.getFullYear();
      const prevMonth = previousDate.getMonth();
      const startYear = startDate.getFullYear();
      const startMonth = startDate.getMonth();
      if (prevYear === startYear && prevMonth === startMonth) {
        break;
      }
    } else if (interval === 'week') {
      const prevWeekStart = getWeekStart(previousDate);
      const startWeekStart = getWeekStart(startDate);
      if (prevWeekStart.getTime() === startWeekStart.getTime()) {
        break;
      }
    }

    currentDate = previousDate;
  }

  return sqls;
}

export function createMaterializedView({
  name: tableName,
  query,
  engine = 'AggregatingMergeTree()',
  orderBy,
  partitionBy,
  settings = {},
  populate = false,
  distributionHash = 'rand()',
  replicatedVersion,
  isClustered,
}: CreateMaterializedViewOptions): string[] {
  const settingsClause = Object.entries(settings).length
    ? `SETTINGS ${Object.entries(settings)
        .map(([key, value]) => `${key} = ${value}`)
        .join(', ')}`
    : '';

  const partitionByClause = partitionBy ? `PARTITION BY ${partitionBy}` : '';

  const transformedQuery = query.replace(/\{(\w+)\}/g, (_, tableName) =>
    isClustered ? replicated(tableName) : tableName
  );

  if (!isClustered) {
    return [
      `CREATE MATERIALIZED VIEW IF NOT EXISTS ${tableName}
ENGINE = ${engine}
${partitionByClause}
ORDER BY (${orderBy.join(', ')})
${settingsClause}
${populate ? 'POPULATE' : ''}
AS ${transformedQuery}`.trim(),
    ];
  }

  return [
    `CREATE MATERIALIZED VIEW IF NOT EXISTS ${replicated(tableName)} ON CLUSTER '{cluster}'
ENGINE = Replicated${engine.replace(/^(.+?)\((.+?)?\)/, `$1('${CLUSTER_REPLICA_PATH.replace('{replicatedVersion}', replicatedVersion)}', '{replica}', $2)`).replace(/, \)$/, ')')}
${partitionByClause}
ORDER BY (${orderBy.join(', ')})
${settingsClause}
${populate ? 'POPULATE' : ''}
AS ${transformedQuery}`.trim(),
    `CREATE TABLE IF NOT EXISTS ${tableName} ON CLUSTER '{cluster}' AS ${replicated(tableName)}
ENGINE = Distributed('{cluster}', currentDatabase(), ${replicated(tableName)}, ${distributionHash})`,
  ];
}

export function countRows(tableName: string) {
  return `SELECT count() FROM ${tableName}`;
}

export async function runClickhouseMigrationCommands(sqls: string[]) {
  let abort: AbortController | undefined;
  let activeQueryId: string | undefined;

  const handleTermination = async (signal: string) => {
    console.warn(
      `Received ${signal}. Cleaning up active queries before exit...`
    );

    if (abort) {
      abort.abort();
    }
  };

  const handleSigterm = () => handleTermination('SIGTERM');
  const handleSigint = () => handleTermination('SIGINT');

  process.on('SIGTERM', handleSigterm);
  process.on('SIGINT', handleSigint);

  try {
    for (const sql of sqls) {
      abort = new AbortController();
      let timer: NodeJS.Timeout | undefined;
      let resolve: ((value: unknown) => void) | undefined;
      activeQueryId = crypto.createHash('sha256').update(sql).digest('hex');

      console.log('----------------------------------------');
      console.log('---| Running query | Query ID:', activeQueryId);
      console.log('---| SQL |------------------------------');
      console.log(sql);
      console.log('----------------------------------------');

      try {
        const res = await Promise.race([
          chMigrationClient.command({
            query: sql,
            query_id: activeQueryId,
            abort_signal: abort?.signal,
          }),
          new Promise((r) => {
            resolve = r;
            let checking = false; // Add flag to prevent multiple concurrent checks

            async function check() {
              if (checking) {
                return;
              }
              checking = true;

              try {
                const res = await chMigrationClient
                  .query({
                    query: `SELECT
                              query_id,
                              elapsed,
                              read_rows,
                              written_rows,
                              memory_usage
                            FROM system.processes 
                            WHERE query_id = '${activeQueryId}'`,
                    format: 'JSONEachRow',
                  })
                  .then((res) => res.json());

                const formatMemory = (bytes: number) => {
                  const units = ['B', 'KB', 'MB', 'GB'];
                  let size = bytes;
                  let unitIndex = 0;
                  while (size >= 1024 && unitIndex < units.length - 1) {
                    size /= 1024;
                    unitIndex++;
                  }
                  return `${Math.round(size * 100) / 100}${units[unitIndex]}`;
                };

                const formatNumber = (num: number) => {
                  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
                };

                if (Array.isArray(res) && res.length > 0) {
                  const { elapsed, read_rows, written_rows, memory_usage } =
                    res[0] as any;
                  console.log(
                    `Progress: ${elapsed.toFixed(2)}s | Memory: ${formatMemory(memory_usage)} | Read: ${formatNumber(read_rows)} rows | Written: ${formatNumber(written_rows)} rows`
                  );
                }
              } finally {
                checking = false;
              }

              timer = setTimeout(check, 5000);
            }

            timer = setTimeout(check, 5000);
          }),
        ]);

        if (timer) {
          clearTimeout(timer);
        }
        if (resolve) {
          resolve(res);
        }
      } catch (e) {
        console.log('Failed on query', sql);
        throw e;
      }
    }
  } catch (e) {
    if (abort) {
      abort.abort();
    }

    if (activeQueryId) {
      try {
        await chMigrationClient.command({
          query: `KILL QUERY WHERE query_id = '${activeQueryId}'`,
        });
        console.log(`Successfully killed query ${activeQueryId}`);
      } catch (err) {
        console.error(`Failed to kill query ${activeQueryId}:`, err);
      }
    }

    throw e;
  } finally {
    // Clean up event listeners. bun-types' `Process.off` override declares
    // only its own "memoryPressure" overload and wins over the @types/node
    // Signals overload, so the cast is what keeps this compiling (dropping it
    // produces TS2345 on both lines below).
    const emitter = process as unknown as EventEmitter;
    emitter.off('SIGTERM', handleSigterm);
    emitter.off('SIGINT', handleSigint);
  }
}
