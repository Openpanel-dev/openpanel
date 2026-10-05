import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { ch } from '../src/clickhouse/client';
import { sql } from '../src/clickhouse/sql';

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
    if (!host) {
      throw new Error('Host is required');
    }

    const user = getArg(values.user) || (await rl.question('Remote User: '));
    if (!user) {
      throw new Error('User is required');
    }

    const password =
      getArg(values.password) || (await rl.question('Remote Password: '));
    if (!password) {
      throw new Error('Password is required');
    }

    const dbName =
      getArg(values.db) ||
      (await rl.question('Remote DB Name (default: openpanel): ')) ||
      'openpanel';

    const startDate =
      getArg(values.start) ||
      (await rl.question('Start Date (YYYY-MM-DD HH:mm:ss): '));
    if (!startDate) {
      throw new Error('Start date is required');
    }

    const endDate =
      getArg(values.end) ||
      (await rl.question('End Date (YYYY-MM-DD HH:mm:ss): '));
    if (!endDate) {
      throw new Error('End date is required');
    }

    const projectIdsInput =
      getArg(values.projects) ||
      (await rl.question(
        'Project IDs (comma separated, leave empty for all): '
      ));
    const projectIds = projectIdsInput
      ? projectIdsInput.split(',').map((s: string) => s.trim())
      : [];

    console.log('\nStarting copy process...');

    const tables = ['sessions', 'events'];

    for (const table of tables) {
      console.log(`Processing table: ${table}`);

      // Every remote() argument is a bound param, so credentials never enter
      // the query text and the log line below is safe. `dbName` and `table` are
      // bound as {x:Identifier} inside remote() and validated by sql.id() in
      // the INSERT target, where a param is not accepted.
      const remoteTable = sql`remote(${sql.string(host)}, ${sql.identifier(dbName)}, ${sql.identifier(table)}, ${sql.string(user)}, ${sql.string(password)})`;

      const projectFilter =
        projectIds.length > 0
          ? sql` AND project_id IN ${sql.array('String', projectIds)}`
          : sql.empty;

      const selectQuery = sql`SELECT * FROM ${remoteTable} WHERE created_at BETWEEN ${sql.string(startDate)} AND ${sql.string(endDate)}${projectFilter}`;

      const insertQuery =
        sql`INSERT INTO ${sql.id(dbName)}.${sql.id(table)} ${selectQuery}`.toStatement();

      console.log(`Executing: ${insertQuery.query}`);
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
