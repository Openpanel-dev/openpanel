import fs from 'node:fs';
import path from 'node:path';
import { ch, db } from '../index';
import { printBoxMessage } from './helpers';

async function migrate() {
  const migrationsDir = path.join(__dirname, '..', 'code-migrations');
  const migrations = fs.readdirSync(migrationsDir).filter((file) => {
    const version = file.split('-')[0];
    return (
      !Number.isNaN(Number.parseInt(version ?? '')) && file.endsWith('.ts')
    );
  });

  const finishedMigrations = await db.codeMigration.findMany();

  for (const file of migrations) {
    if (finishedMigrations.some((migration) => migration.name === file)) {
      printBoxMessage('⏭️  Skipping Migration  ⏭️', [`${file}`]);
      continue;
    }

    printBoxMessage('⚡️ Running Migration ⚡️ ', [`${file}`]);
    try {
      const migration = await import(path.join(migrationsDir, file));
      await migration.up();
      await db.codeMigration.create({
        data: {
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

  console.log('Migrations finished');
  process.exit(0);
}

migrate();
