import fs from 'node:fs';
import path from 'node:path';
import {
  addColumns,
  runClickhouseMigrationCommands,
} from '../src/clickhouse/migration';
import { getIsCluster } from './helpers';

export async function up() {
  const isClustered = getIsCluster();

  // `inserted_at` is the ingestion (CH-insert) time, used as the cursor for the
  // object-store export job. New rows set it explicitly at insert time (see
  // createEvent / moveImportsToProduction). The DEFAULT is `created_at` — NOT
  // `now()` — on purpose: a DEFAULT now() on a column added to an existing
  // MergeTree is evaluated lazily at read time for pre-migration parts, so old
  // rows would read as "just inserted" on every scan and never settle. Defaulting
  // to the existing `created_at` column is deterministic and needs no part
  // rewrite, so historical rows keep a stable, in-the-past inserted_at.
  // `inserted_at` is not part of the table's ORDER BY, so the windowed export
  // query (WHERE inserted_at > cursor) can't use the primary index. A minmax
  // skip index lets ClickHouse skip granules whose inserted_at range is entirely
  // below the cursor. It only needs to exist on the local MergeTree (the
  // `_replicated` table when clustered); the distributed table has no data.
  const indexName = 'idx_inserted_at';
  const indexExpr = `ADD INDEX IF NOT EXISTS ${indexName} inserted_at TYPE minmax GRANULARITY 1`;
  const indexSql = isClustered
    ? `ALTER TABLE events_replicated ON CLUSTER '{cluster}' ${indexExpr}`
    : `ALTER TABLE events ${indexExpr}`;

  const sqls: string[] = [
    ...addColumns(
      'events',
      ['`inserted_at` DateTime64(3) DEFAULT created_at AFTER `imported_at`'],
      isClustered,
    ),
    indexSql,
  ];

  fs.writeFileSync(
    path.join(__filename.replace('.ts', '.sql')),
    sqls
      .map((sql) =>
        sql
          .trim()
          .replace(/;$/, '')
          .replace(/\n{2,}/g, '\n')
          .concat(';'),
      )
      .join('\n\n---\n\n'),
  );

  if (!process.argv.includes('--dry')) {
    await runClickhouseMigrationCommands(sqls);
  }
}
