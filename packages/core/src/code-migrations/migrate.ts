import fs from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { db } from '@openpanel/db';
import {
  getIsCluster,
  getIsDry,
  getIsSelfHosting,
  getShouldIgnoreRecord,
  printBoxMessage,
} from './helpers';

async function migrate() {
  const args = process.argv.slice(2);
  const migration = args.filter((arg) => !arg.startsWith('--'))[0];

  const migrationsDir = path.join(__dirname, '..', 'code-migrations');
  const migrations = fs
    .readdirSync(migrationsDir)
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
    `isClustered:   ${getIsCluster()}`,
    `isSelfHosting: ${getIsSelfHosting()}`,
  ]);

  printBoxMessage('🌍 Environment', [
    `POSTGRES:   ${process.env.DATABASE_URL}`,
    `CLICKHOUSE: ${process.env.CLICKHOUSE_URL}`,
  ]);

  if (!getIsSelfHosting()) {
    if (getIsDry()) {
      printBoxMessage('🕒 Migrations starts now (dry run)', []);
    } else {
      printBoxMessage('🕒 Migrations starts in 10 seconds', []);
      await new Promise((resolve) => setTimeout(resolve, 10_000));
    }
  }

  if (migration) {
    await runMigration(migrationsDir, migration);
  } else {
    for (const file of migrations) {
      if (finishedMigrations.some((migration) => migration.name === file)) {
        printBoxMessage('✅  Already Migrated  ✅', [`${file}`]);
        continue;
      }

      await runMigration(migrationsDir, file);
    }
  }

  console.log('Migrations finished');
  process.exit(0);
}

async function runMigration(migrationsDir: string, file: string) {
  printBoxMessage('⚡️ Running Migration ⚡️ ', [`${file}`]);
  try {
    const migration = await import(path.join(migrationsDir, file));
    await migration.up();
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

migrate();
