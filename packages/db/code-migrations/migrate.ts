import fs from 'node:fs';
import path from 'node:path';
import { ch, db } from '../index';
import { printBoxMessage } from './helpers';

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

  if (migration) {
    await runMigration(migrationsDir, migration);
  } else {
    const finishedMigrations = await db.codeMigration.findMany();

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
  } catch (error) {
    printBoxMessage('❌  Migration Failed  ❌', [
      `Error running migration ${file}:`,
      error,
    ]);
    process.exit(1);
  }
}

migrate();
