#!/usr/bin/env node
import inquirer from 'inquirer';
import { clearCache } from './commands/clear-cache';
import { deleteOrganization } from './commands/delete-organization';
import { deleteUser } from './commands/delete-user';
import { lookupByClient } from './commands/lookup-client';
import { lookupByEmail } from './commands/lookup-email';
import { lookupByOrg } from './commands/lookup-org';
import { lookupByProject } from './commands/lookup-project';

const secureEnv = (url: string) => {
  const parsed = new URL(url);
  if (parsed.username && parsed.password) {
    return `${parsed.protocol}//${parsed.username}:${parsed.password.slice(0, 1)}...${parsed.password.slice(-1)}@${parsed.hostname}:${parsed.port}`;
  }

  return url;
};

async function main() {
  console.log('\n🔧 OpenPanel Admin CLI\n');

  const DATABASE_URL = process.env.DATABASE_URL;
  const CLICKHOUSE_URL = process.env.CLICKHOUSE_URL;
  const REDIS_URL = process.env.REDIS_URL;

  if (!DATABASE_URL || !CLICKHOUSE_URL || !REDIS_URL) {
    console.error('Environment variables are not set');
    process.exit(1);
  }

  // Log environment variables for debugging
  console.log('Environment:', {
    NODE_ENV: process.env.NODE_ENV,
    SELF_HOSTED: process.env.SELF_HOSTED ? 'Yes' : 'No',
    DATABASE_URL: secureEnv(DATABASE_URL),
    CLICKHOUSE_URL: secureEnv(CLICKHOUSE_URL),
    REDIS_URL: secureEnv(REDIS_URL),
  });
  console.log('');

  const { command } = await inquirer.prompt([
    {
      type: 'list',
      name: 'command',
      message: 'What would you like to do?',
      pageSize: 20,
      choices: [
        {
          name: '🏢 Lookup by Organization',
          value: 'lookup-org',
        },
        {
          name: '📊 Lookup by Project',
          value: 'lookup-project',
        },
        {
          name: '🔑 Lookup by Client ID',
          value: 'lookup-client',
        },
        {
          name: '📧 Lookup by Email',
          value: 'lookup-email',
        },
        {
          name: '🗑️  Clear Cache',
          value: 'clear-cache',
        },
        { name: '─────────────────────', value: 'separator', disabled: true },
        {
          name: '🔴 Delete Organization',
          value: 'delete-org',
        },
        {
          name: '🔴 Delete User',
          value: 'delete-user',
        },
        { name: '─────────────────────', value: 'separator', disabled: true },
        { name: '❌ Exit', value: 'exit' },
      ],
    },
  ]);

  switch (command) {
    case 'lookup-org':
      await lookupByOrg();
      break;
    case 'lookup-project':
      await lookupByProject();
      break;
    case 'lookup-client':
      await lookupByClient();
      break;
    case 'lookup-email':
      await lookupByEmail();
      break;
    case 'clear-cache':
      await clearCache();
      break;
    case 'delete-org':
      await deleteOrganization();
      break;
    case 'delete-user':
      await deleteUser();
      break;
    case 'exit':
      console.log('Goodbye! 👋');
      process.exit(0);
  }

  // Loop back to main menu
  await main();
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
