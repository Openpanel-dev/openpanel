import fs from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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

export async function runCodeMigrations(env: CodeMigrationEnv) {
  const args = process.argv.slice(2);
  const migration = args.filter((arg) => !arg.startsWith('--'))[0];

  const migrations = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => {
      const version = file.split('-')[0];
      return (
        !Number.isNaN(Number.parseInt(version ?? '', 10)) &&
        file.endsWith('.ts')
      );
    })
    .sort((a, b) => {
      const aVersion = Number.parseInt(a.split('-')[0]!, 10);
      const bVersion = Number.parseInt(b.split('-')[0]!, 10);
      return aVersion - bVersion;
    });

  const finishedMigrations = await db.codeMigration.findMany();

  printBoxMessage('📋 Plan', [
    '\t✅ Finished:',
    ...finishedMigrations.map(
      (migration) => `\t- ${migration.name} (${migration.createdAt})`
    ),
    '',
    '\t🔄 Will run now:',
    ...migrations
      .filter(
        (migration) =>
          !finishedMigrations.some(
            (finishedMigration) => finishedMigration.name === migration
          )
      )
      .map((migration) => `\t- ${migration}`),
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

  if (migration) {
    await runMigration(migration, env);
  } else {
    for (const file of migrations) {
      if (finishedMigrations.some((migration) => migration.name === file)) {
        printBoxMessage('✅  Already Migrated  ✅', [`${file}`]);
        continue;
      }

      await runMigration(file, env);
    }
  }

  console.log('Migrations finished');
  process.exit(0);
}

async function runMigration(file: string, env: CodeMigrationEnv) {
  printBoxMessage('⚡️ Running Migration ⚡️ ', [`${file}`]);
  try {
    const migration = await import(path.join(MIGRATIONS_DIR, file));
    await migration.up(env);
    if (!(getIsDry() || getShouldIgnoreRecord())) {
      await db.codeMigration.upsert({
        where: {
          name: file,
        },
        update: {
          name: file,
        },
        create: {
          name: file,
        },
      });
    }
  } catch (error) {
    printBoxMessage('❌  Migration Failed  ❌', [
      `Error running migration ${file}:`,
      error,
    ]);
    process.exit(1);
  }
}
