import crypto from 'node:crypto';
import { createClient } from './client';
import { formatClickhouseDate } from './client';

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

export const chMigrationClient = createClient({
  url: process.env.CLICKHOUSE_URL,
  request_timeout: 3600000, // 1 hour in milliseconds
  keep_alive: {
    enabled: true,
  },
  compression: {
    request: true,
    response: true,
  },
  clickhouse_settings: {
    wait_end_of_query: 1,
    // Ask ClickHouse to periodically send query execution progress in HTTP headers, creating some activity in the connection.
    send_progress_in_http_headers: 1,
    // The interval of sending these progress headers. Here it is less than 60s,
    http_headers_progress_interval_ms: '50000',
  },
});

export function createDatabase(name: string, isClustered: boolean) {
  if (isClustered) {
    return `CREATE DATABASE IF NOT EXISTS ${name} ON CLUSTER '{cluster}'`;
  }

  return `CREATE DATABASE IF NOT EXISTS ${name}`;
}

/**
 * Creates SQL statements for table creation in ClickHouse
 * Handles both clustered and non-clustered scenarios
 */
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
    // Non-clustered scenario: single table
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
    // Local replicated table
    `CREATE TABLE IF NOT EXISTS ${replicated(tableName)} ON CLUSTER '{cluster}' (
  ${columnDefinitions}
)
ENGINE = Replicated${engine.replace(/^(.+?)\((.+?)?\)/, `$1('${CLUSTER_REPLICA_PATH.replace('{replicatedVersion}', replicatedVersion)}', '{replica}', $2)`).replace(/, \)$/, ')')}
${partitionByClause}
ORDER BY (${orderBy.join(', ')})
${settingsClause}`.trim(),
    // Distributed table
    `CREATE TABLE IF NOT EXISTS ${tableName} ON CLUSTER '{cluster}' AS ${replicated(tableName)}
ENGINE = Distributed('{cluster}', currentDatabase(), ${replicated(tableName)}, ${distributionHash})`,
  ];
}

/**
 * Generates ALTER TABLE statements for adding columns
 */
export function addColumns(
  tableName: string,
  columns: string[],
  isClustered: boolean,
): string[] {
  if (isClustered) {
    return columns.map(
      (col) =>
        `ALTER TABLE ${replicated(tableName)} ON CLUSTER '{cluster}' ADD COLUMN IF NOT EXISTS ${col}`,
    );
  }

  return columns.map(
    (col) => `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${col}`,
  );
}

/**
 * Generates ALTER TABLE statements for dropping columns
 */
export function dropColumns(
  tableName: string,
  columnNames: string[],
  isClustered: boolean,
): string[] {
  if (isClustered) {
    return columnNames.map(
      (colName) =>
        `ALTER TABLE ${replicated(tableName)} ON CLUSTER '{cluster}' DROP COLUMN IF EXISTS ${colName}`,
    );
  }

  return columnNames.map(
    (colName) => `ALTER TABLE ${tableName} DROP COLUMN IF EXISTS ${colName}`,
  );
}

export async function getExistingTables() {
  try {
    const existingTablesQuery = await chMigrationClient.query({
      query: `SELECT name FROM system.tables WHERE database = 'openpanel'`,
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
}): string[] {
  const sqls: string[] = [];

  if (!batch) {
    return [`INSERT INTO ${to} SELECT * FROM ${from}`];
  }

  // Start from today and go back 3 years
  const endDate = batch.endDate || new Date();
  if (!batch.endDate) {
    endDate.setDate(endDate.getDate() + 1); // Add 1 day to include today
  }
  const startDate = batch.startDate || new Date();
  if (!batch.startDate) {
    startDate.setFullYear(startDate.getFullYear() - 3);
  }

  let currentDate = endDate;
  const interval = batch.interval || 'day';

  while (currentDate > startDate) {
    const previousDate = new Date(currentDate);

    switch (interval) {
      case 'month':
        previousDate.setMonth(previousDate.getMonth() - 1);
        break;
      case 'week':
        previousDate.setDate(previousDate.getDate() - 7);
        // Ensure we don't go below startDate
        if (previousDate < startDate) {
          previousDate.setTime(startDate.getTime());
        }
        break;
      // day
      default:
        previousDate.setDate(previousDate.getDate() - 1);
        break;
    }

    const sql = `INSERT INTO ${to} 
      SELECT * FROM ${from} 
      WHERE ${batch.column} > '${batch.transform ? batch.transform(previousDate) : formatClickhouseDate(previousDate, true)}' 
      AND ${batch.column} <= '${batch.transform ? batch.transform(currentDate) : formatClickhouseDate(currentDate, true)}'`;
    sqls.push(sql);

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

  // Transform query to use replicated table names in clustered mode
  const transformedQuery = query.replace(/\{(\w+)\}/g, (_, tableName) =>
    isClustered ? replicated(tableName) : tableName,
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
    // Replicated materialized view
    `CREATE MATERIALIZED VIEW IF NOT EXISTS ${replicated(tableName)} ON CLUSTER '{cluster}'
ENGINE = Replicated${engine.replace(/^(.+?)\((.+?)?\)/, `$1('${CLUSTER_REPLICA_PATH.replace('{replicatedVersion}', replicatedVersion)}', '{replica}', $2)`).replace(/, \)$/, ')')}
${partitionByClause}
ORDER BY (${orderBy.join(', ')})
${settingsClause}
${populate ? 'POPULATE' : ''}
AS ${transformedQuery}`.trim(),
    // Distributed materialized view
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
      `Received ${signal}. Cleaning up active queries before exit...`,
    );

    if (abort) {
      abort.abort();
    }
  };

  // Create bound handler functions
  const handleSigterm = () => handleTermination('SIGTERM');
  const handleSigint = () => handleTermination('SIGINT');

  // Register handlers
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
              if (checking) return; // Skip if already checking
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
                    `Progress: ${elapsed.toFixed(2)}s | Memory: ${formatMemory(memory_usage)} | Read: ${formatNumber(read_rows)} rows | Written: ${formatNumber(written_rows)} rows`,
                  );
                }
              } finally {
                checking = false;
              }

              timer = setTimeout(check, 5000); // Schedule next check after current one completes
            }

            // Start the first check after 5 seconds
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
    // Clean up event listeners
    process.off('SIGTERM', handleSigterm);
    process.off('SIGINT', handleSigint);
  }
}
