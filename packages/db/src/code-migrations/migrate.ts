import fs from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chMigrationClient } from '../clickhouse/migration';
import { db } from '../prisma-client';
import {
  type CodeMigrationEnv,
  getIsCluster,
  getIsDry,
  getIsSelfHosting,
  getShouldIgnoreRecord,
  printBoxMessage,
  redactConnectionUrls,
} from './helpers';

const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url));

interface CodeMigration {
  up: (env: CodeMigrationEnv) => Promise<void>;
}

function migrationVersion(file: string) {
  return Number.parseInt(file.split('-')[0] ?? '', 10);
}

function listMigrationFiles() {
  return (
    fs
      .readdirSync(MIGRATIONS_DIR)
      // A migration's test sits beside it and must not run as a migration.
      .filter(
        (file) =>
          !Number.isNaN(migrationVersion(file)) &&
          file.endsWith('.ts') &&
          !file.endsWith('.test.ts')
      )
      .sort((a, b) => migrationVersion(a) - migrationVersion(b))
  );
}

async function loadMigration(file: string): Promise<CodeMigration> {
  return await import(path.join(MIGRATIONS_DIR, file));
}

async function getFinishedMigrationNames() {
  const finished = await db.codeMigration.findMany({ select: { name: true } });
  return new Set(finished.map((migration) => migration.name));
}

// Present on every install once the first migrations ran; Distributed when
// the database is a cluster.
const LAYOUT_TABLES = ['events', 'sessions', 'profiles'];

/**
 * A migration written for one ClickHouse layout and run against the other
 * swaps or rewrites the wrong tables, so the configured mode must match what
 * the database actually has. A database without these tables yet is being
 * created and has nothing to check.
 */
async function assertClusterModeMatchesDatabase(env: CodeMigrationEnv) {
  const response = await chMigrationClient.query({
    query:
      'SELECT name, engine FROM system.tables WHERE database = currentDatabase() AND name IN {names:Array(String)}',
    query_params: { names: LAYOUT_TABLES },
    format: 'JSONEachRow',
  });
  const tables = await response.json<{ name: string; engine: string }>();
  if (tables.length === 0) {
    return;
  }
  const isDistributed = tables.some((table) => table.engine === 'Distributed');
  const isCluster = getIsCluster(env);
  if (isDistributed !== isCluster) {
    const found = tables
      .map((table) => `${table.name}=${table.engine}`)
      .join(', ');
    throw new Error(
      `CLICKHOUSE_CLUSTER is ${isCluster ? 'set' : 'not set'}, but the database has ${found}. Refusing to migrate: fix CLICKHOUSE_CLUSTER for this process.`
    );
  }
}

/** Runs one migration and records it as finished. Throws on failure. */
export async function runMigration(file: string, env: CodeMigrationEnv) {
  await assertClusterModeMatchesDatabase(env);
  const migration = await loadMigration(file);
  await migration.up(env);
  if (!(getIsDry() || getShouldIgnoreRecord())) {
    await db.codeMigration.upsert({
      where: { name: file },
      update: { name: file },
      create: { name: file },
    });
  }
}

/**
 * Unfinished migrations in file order. Never reordered: a migration may
 * depend on everything numbered before it, data moves included.
 */
export async function getPendingMigrations() {
  const finished = await getFinishedMigrationNames();
  return listMigrationFiles().filter((file) => !finished.has(file));
}

async function runMigrationOrExit(file: string, env: CodeMigrationEnv) {
  printBoxMessage('⚡️ Running Migration ⚡️ ', [`${file}`]);
  try {
    await runMigration(file, env);
  } catch (error) {
    printBoxMessage('❌  Migration Failed  ❌', [
      `Error running migration ${file}:`,
      error,
    ]);
    process.exit(1);
  }
}

/**
 * The command-line runner (`migrate:deploy`, and operators who do not set
 * AUTOMATIC_MIGRATIONS): every pending migration, in order. The api may keep
 * serving meanwhile. A migration named on the command line runs on its own.
 */
export async function runCodeMigrations(env: CodeMigrationEnv) {
  const args = process.argv.slice(2);
  const named = args.filter((arg) => !arg.startsWith('--'))[0];

  const finished = await getFinishedMigrationNames();
  const pending = await getPendingMigrations();

  printBoxMessage('📋 Plan', [
    '\t✅ Finished:',
    ...[...finished].map((name) => `\t- ${name}`),
    '',
    '\t🔄 Will run now:',
    ...(named ? [named] : pending).map((file) => `\t- ${file}`),
  ]);

  printBoxMessage('🤝 Config', [
    `isClustered:   ${getIsCluster(env)}`,
    `isSelfHosting: ${getIsSelfHosting(env)}`,
  ]);

  printBoxMessage('🌍 Environment', [
    `POSTGRES:   ${redactConnectionUrls(env.databaseUrl)}`,
    `CLICKHOUSE: ${redactConnectionUrls(env.clickhouseUrl)}`,
  ]);

  if (!getIsSelfHosting(env)) {
    if (getIsDry()) {
      printBoxMessage('🕒 Migrations starts now (dry run)', []);
    } else {
      printBoxMessage('🕒 Migrations starts in 10 seconds', []);
      await new Promise((resolve) => setTimeout(resolve, 10_000));
    }
  }

  if (named) {
    await runMigrationOrExit(named, env);
  } else {
    for (const file of pending) {
      await runMigrationOrExit(file, env);
    }
  }

  console.log('Migrations finished');
  process.exit(0);
}
