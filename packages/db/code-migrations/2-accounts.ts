import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from '../index';
import { printBoxMessage } from './helpers';

const simpleCsvParser = (csv: string): Record<string, unknown>[] => {
  const rows = csv.split('\n');
  const headers = rows[0]!.split(',');
  return rows.slice(1).map((row) =>
    row.split(',').reduce(
      (acc, curr, index) => {
        acc[headers[index]!] = curr;
        return acc;
      },
      {} as Record<string, unknown>,
    ),
  );
};

async function checkFileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true; // File exists
  } catch (error) {
    return false; // File does not exist
  }
}

export async function up() {
  const accountCount = await db.account.count();
  const userCount = await db.user.count();
  if (accountCount > 0) {
    printBoxMessage('⏭️  Skipping Migration  ⏭️', ['Accounts already migrated']);
    return;
  }

  if (userCount === 0) {
    printBoxMessage('⏭️  Skipping Migration  ⏭️', [
      'No users found, skipping migration',
    ]);
    return;
  }

  const dumppath = path.join(__dirname, 'users-dump.csv');
  // check if file exists
  if (!(await checkFileExists(dumppath))) {
    printBoxMessage('⚠️  Missing Required File  ⚠️', [
      `File not found: ${dumppath}`,
      'This file is required to run this migration',
      '',
      'You can export it from:',
      'Clerk > Configure > Settings > Export all users',
    ]);
    throw new Error('Required users dump file not found');
  }
  const csv = await fs.readFile(path.join(__dirname, 'users-dump.csv'), 'utf8');
  const data = simpleCsvParser(csv);

  for (const row of data) {
    const email =
      row.primary_email_address ||
      row.verified_email_addresses ||
      row.unverified_email_addresses;

    if (!email) {
      continue;
    }

    const user = await db.user.findUnique({
      where: {
        email: String(email),
      },
    });

    if (!user) {
      continue;
    }

    await db.account.create({
      data: {
        userId: user.id,
        provider: row.password_digest ? 'email' : 'oauth',
        providerId: null,
        password: row.password_digest ? String(row.password_digest) : null,
      },
    });
  }
}
