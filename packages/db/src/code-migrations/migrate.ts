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
// The api is already serving while blocking migrations run, against the old
// schema until they finish, so they must stay fast.
const SLOW_BLOCKING_MIGRATION_MS = 30_000;

/**
 * A code migration module. The api applies pending ones after it starts
 * listening (`startCodeMigrations` in @openpanel/core): every blocking one
 * first, then the `online` ones. `online` marks work that grows with the data:
 * it must stay correct under live traffic and resume after an interruption,
 * and no blocking migration may depend on it.
 */
interface CodeMigration {
  up: (env: CodeMigrationEnv) => Promise<void>;
  online?: boolean;
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

/**
 * Runs one migration and records it as finished. Throws on failure. Warns
 * when a blocking migration is slow enough to be a long window of the api
 * running against the old schema.
 */
export async function runMigration(file: string, env: CodeMigrationEnv) {
  await assertClusterModeMatchesDatabase(env);
  const migration = await loadMigration(file);
  const startedAt = performance.now();
  await migration.up(env);
  const durationMs = performance.now() - startedAt;
  if (!migration.online && durationMs > SLOW_BLOCKING_MIGRATION_MS) {
    printBoxMessage('🐢 Slow blocking migration', [
      `${file} took ${Math.round(durationMs / 1000)}s; the api ran against the old schema meanwhile.`,
      'Work that grows with the data belongs in an online migration (AGENTS.md → Migrations).',
    ]);
  }
  if (!(getIsDry() || getShouldIgnoreRecord())) {
    await db.codeMigration.upsert({
      where: { name: file },
      update: { name: file },
      create: { name: file },
    });
  }
}

/**
 * Unfinished migrations in the order the api runs them: blocking ones first,
 * so a fast breaking change never waits behind a long online data move.
 */
export async function getPendingMigrations() {
  const finished = await getFinishedMigrationNames();
  const blocking: string[] = [];
  const online: string[] = [];
  for (const file of listMigrationFiles()) {
    if (finished.has(file)) {
      continue;
    }
    if ((await loadMigration(file)).online) {
      online.push(file);
    } else {
      blocking.push(file);
    }
  }
  return [...blocking, ...online];
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
 * The command-line runner (`migrate:deploy`, for development, CI and
 * operators): every unfinished blocking migration, in order, so a fresh
 * database has its schema before anything seeds it. Online ones are left to
 * the api. A migration named on the command line runs either way.
 */
export async function runCodeMigrations(env: CodeMigrationEnv) {
  const args = process.argv.slice(2);
  const named = args.filter((arg) => !arg.startsWith('--'))[0];

  const finished = await getFinishedMigrationNames();
  const unfinished = listMigrationFiles().filter((file) => !finished.has(file));
  const online = new Set<string>();
  for (const file of unfinished) {
    if ((await loadMigration(file)).online) {
      online.add(file);
    }
  }

  printBoxMessage('📋 Plan', [
    '\t✅ Finished:',
    ...[...finished].map((name) => `\t- ${name}`),
    '',
    '\t🔄 Will run now:',
    ...unfinished
      .filter((file) => !online.has(file))
      .map((file) => `\t- ${file}`),
    '',
    '\t🌙 Online, applied by the api once it is up:',
    ...[...online].map((file) => `\t- ${file}`),
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
    for (const file of unfinished) {
      if (!online.has(file)) {
        await runMigrationOrExit(file, env);
      }
    }
  }

  console.log('Migrations finished');
  process.exit(0);
}
