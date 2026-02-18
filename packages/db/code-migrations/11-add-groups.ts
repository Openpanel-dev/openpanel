import fs from 'node:fs';
import path from 'node:path';
import {
  addColumns,
  runClickhouseMigrationCommands,
} from '../src/clickhouse/migration';
import { getIsCluster } from './helpers';

export async function up() {
  const isClustered = getIsCluster();

  const databaseUrl = process.env.DATABASE_URL ?? '';
  // Parse postgres connection string: postgresql://user:password@host:port/dbname
  const match = databaseUrl.match(
    /postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+?)(\?.*)?$/
  );

  if (!match) {
    throw new Error(`Could not parse DATABASE_URL: ${databaseUrl}`);
  }

  const [, pgUser, pgPassword, pgHost, pgPort, pgDb] = match;

  const dictSql = `CREATE DICTIONARY IF NOT EXISTS groups_dict
(
  id         String,
  project_id String,
  type       String,
  name       String,
  properties String
)
PRIMARY KEY id, project_id
SOURCE(POSTGRESQL(
  host '${pgHost}'
  port ${pgPort}
  user '${pgUser}'
  password '${pgPassword}'
  db '${pgDb}'
  table 'groups'
))
LIFETIME(MIN 300 MAX 600)
LAYOUT(COMPLEX_KEY_HASHED())`;

  const sqls: string[] = [
    ...addColumns(
      'events',
      ['`groups` Array(String) DEFAULT [] CODEC(ZSTD(3))'],
      isClustered
    ),
    dictSql,
  ];

  fs.writeFileSync(
    path.join(import.meta.filename.replace('.ts', '.sql')),
    sqls
      .map((sql) =>
        sql
          .trim()
          .replace(/;$/, '')
          .replace(/\n{2,}/g, '\n')
          .concat(';')
      )
      .join('\n\n---\n\n')
  );

  if (!process.argv.includes('--dry')) {
    await runClickhouseMigrationCommands(sqls);
  }
}
