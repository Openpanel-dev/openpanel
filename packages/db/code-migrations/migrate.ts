import fs from 'node:fs';
import path from 'node:path';
import { db } from '../index';
import { getIsDry, getIsSelfHosting, printBoxMessage } from './helpers';

async function migrate() {
  const args = process.argv.slice(2);
  const migration = args.filter((arg) => !arg.startsWith('--'))[0];

  const migrationsDir = path.join(__dirname, '..', 'code-migrations');
  const migrations = fs.readdirSync(migrationsDir).filter((file) => {
    const version = file.split('-')[0];
    return (
      !Number.isNaN(Number.parseInt(version ?? '')) && file.endsWith('.ts')
    );
  });

  const finishedMigrations = await db.codeMigration.findMany();

  printBoxMessage('📋 Plan', [
    '\t✅ Finished:',
    ...finishedMigrations.map(
      (migration) => `\t- ${migration.name} (${migration.createdAt})`,
    ),
    '',
    '\t🔄 Will run now:',
    ...migrations
      .filter(
        (migration) =>
          !finishedMigrations.some(
            (finishedMigration) => finishedMigration.name === migration,
          ),
      )
      .map((migration) => `\t- ${migration}`),
  ]);

  printBoxMessage('🌍 Environment', [
    `POSTGRES:   ${process.env.DATABASE_URL}`,
    `CLICKHOUSE: ${process.env.CLICKHOUSE_URL}`,
  ]);

  if (!getIsSelfHosting()) {
    printBoxMessage('🕒 Migrations starts in 10 seconds', []);
    await new Promise((resolve) => setTimeout(resolve, 10000));
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
    if (!getIsDry()) {
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
