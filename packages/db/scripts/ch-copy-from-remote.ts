import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import sqlstring from 'sqlstring';
import { ch } from '../src/clickhouse/client';
import { clix } from '../src/clickhouse/query-builder';

async function main() {
  const rl = createInterface({ input, output });

  try {
    const { values } = parseArgs({
      args: process.argv.slice(2),
      options: {
        host: { type: 'string' },
        user: { type: 'string' },
        password: { type: 'string' },
        db: { type: 'string' },
        start: { type: 'string' },
        end: { type: 'string' },
        projects: { type: 'string' },
      },
      strict: false,
    });

    const getArg = (val: unknown): string | undefined =>
      typeof val === 'string' ? val : undefined;

    console.log('Copy data from remote ClickHouse to local');
    console.log('---------------------------------------');

    const host =
      getArg(values.host) || (await rl.question('Remote Host (IP/Domain): '));
    if (!host) throw new Error('Host is required');

    const user = getArg(values.user) || (await rl.question('Remote User: '));
    if (!user) throw new Error('User is required');

    const password =
      getArg(values.password) || (await rl.question('Remote Password: '));
    if (!password) throw new Error('Password is required');

    const dbName =
      getArg(values.db) ||
      (await rl.question('Remote DB Name (default: openpanel): ')) ||
      'openpanel';

    const startDate =
      getArg(values.start) ||
      (await rl.question('Start Date (YYYY-MM-DD HH:mm:ss): '));
    if (!startDate) throw new Error('Start date is required');

    const endDate =
      getArg(values.end) ||
      (await rl.question('End Date (YYYY-MM-DD HH:mm:ss): '));
    if (!endDate) throw new Error('End date is required');

    const projectIdsInput =
      getArg(values.projects) ||
      (await rl.question(
        'Project IDs (comma separated, leave empty for all): ',
      ));
    const projectIds = projectIdsInput
      ? projectIdsInput.split(',').map((s: string) => s.trim())
      : [];

    console.log('\nStarting copy process...');

    const tables = ['sessions', 'events'];

    for (const table of tables) {
      console.log(`Processing table: ${table}`);

      // Build the SELECT part using the query builder
      // We use sqlstring to escape the remote function arguments
      const remoteTable = `remote(${sqlstring.escape(host)}, ${sqlstring.escape(dbName)}, ${sqlstring.escape(table)}, ${sqlstring.escape(user)}, ${sqlstring.escape(password)})`;

      const queryBuilder = clix(ch)
        .from(remoteTable)
        .select(['*'])
        .where('created_at', 'BETWEEN', [startDate, endDate]);

      if (projectIds.length > 0) {
        queryBuilder.where('project_id', 'IN', projectIds);
      }

      const selectQuery = queryBuilder.toSQL();
      const insertQuery = `INSERT INTO ${dbName}.${table} ${selectQuery}`;

      console.log(`Executing: ${insertQuery}`);

      // try {
      //   await ch.command({
      //     query: insertQuery,
      //   });
      //   console.log(`✅ Copied ${table} successfully`);
      // } catch (error) {
      //   console.error(`❌ Failed to copy ${table}:`, error);
      // }
    }

    console.log('\nDone!');
  } catch (error) {
    console.error('\nError:', error);
  } finally {
    rl.close();
    await ch.close();
    process.exit(0);
  }
}

main();
