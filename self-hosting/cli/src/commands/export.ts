import { resolve } from 'node:path';
import { log as clackLog } from '@clack/prompts';
import {
  type Auth,
  type ClickHouse,
  createClient,
  dockerPrefix,
  findContainers,
  holdsEvents,
  probeAll,
} from '../export/clickhouse';
import {
  DEFAULT_ROWS_PER_FILE,
  DEFAULT_TABLES,
  runExport,
} from '../export/export';
import { run } from '../run';
import { bold, dim, green, log } from '../ui';

export interface ExportFlags {
  container?: string;
  out: string;
  projectId?: string;
  from?: string;
  to?: string;
  tables?: string;
  rowsPerFile?: string;
  db: string;
  list: boolean;
  noGzip: boolean;
}

const splitList = (value: string | undefined): string[] =>
  (value ?? '')
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

// Credentials are rarely needed (the default container has none), and arriving
// by env keeps them out of shell history.
const authFromEnv = (): Auth => ({
  host: process.env.CH_HOST,
  user: process.env.CH_USER,
  password: process.env.CH_PASSWORD,
});

const printCandidates = async (db: string, auth: Auth) => {
  const rows = await probeAll(db, auth);
  if (rows.length === 0) {
    log('No running containers. Is Docker running, and do you need sudo?');
    return;
  }
  log(bold(`Running containers, and whether they hold '${db}.events':\n`));
  for (const row of rows) {
    const mark = row.hasEvents ? green('yes') : dim('-');
    log(`  ${row.id.padEnd(14)} ${row.name.padEnd(42)} ${mark}`);
  }
  log('\nThen run: openpanel export --container <CONTAINER ID>');
};

const resolveClient = async (
  flags: ExportFlags,
  auth: Auth
): Promise<ClickHouse> => {
  if (flags.container) {
    if (!(await holdsEvents(flags.container, flags.db, auth))) {
      throw new Error(
        `Container '${flags.container}' has no '${flags.db}.events' table. Wrong container, or wrong --db? Try \`openpanel export --list\`.`
      );
    }
    return createClient(dockerPrefix(flags.container), flags.db, auth);
  }

  const matches = await findContainers(flags.db, auth);
  const [only] = matches;
  if (matches.length === 1 && only) {
    clackLog.info(`ClickHouse container: ${only.name} (${only.id})`);
    return createClient(dockerPrefix(only.id), flags.db, auth);
  }
  if (matches.length > 1) {
    const names = matches
      .map((match) => `  ${match.id}  ${match.name}`)
      .join('\n');
    throw new Error(
      `Found ${matches.length} containers with '${flags.db}.events':\n${names}\nPick one with --container <CONTAINER ID>`
    );
  }
  if ((await run(['clickhouse-client', '--version'])).code === 0) {
    clackLog.info('Using clickhouse-client from PATH');
    return createClient(['clickhouse-client'], flags.db, auth);
  }
  throw new Error(
    `No container holds '${flags.db}.events'. Run \`openpanel export --list\`, then pass --container.`
  );
};

export const exportData = async (flags: ExportFlags): Promise<number> => {
  const auth = authFromEnv();
  if (flags.list) {
    await printCandidates(flags.db, auth);
    return 0;
  }

  const client = await resolveClient(flags, auth);
  const out = resolve(flags.out);
  const projectIds = splitList(flags.projectId);
  const tables = splitList(flags.tables);

  log(`Exporting to ${out}`);
  log(
    dim(
      `projects: ${projectIds.join(',') || '<all>'}   range: ${flags.from ?? '<start>'} .. ${flags.to ?? '<now>'}\n`
    )
  );

  const result = await runExport(
    client,
    {
      out,
      database: flags.db,
      tables: tables.length > 0 ? tables : [...DEFAULT_TABLES],
      projectIds,
      from: flags.from,
      to: flags.to,
      rowsPerFile: Number(flags.rowsPerFile ?? DEFAULT_ROWS_PER_FILE),
      gzip: !flags.noGzip,
    },
    {
      onTable: (table) => log(bold(table)),
      onDay: (day, rows) => log(`  ${day}  ${String(rows).padStart(8)} rows`),
      onSkip: (table) => log(dim(`${table} — table does not exist, skipping`)),
    }
  );

  log(green('\nDone.'));
  log(`Projects found: ${result.projectIds}`);
  for (const { table, rows, files } of result.summaries) {
    log(
      `  ${table.padEnd(18)} ${String(rows).padStart(10)} rows in ${files} file(s)`
    );
  }
  log(
    `\nShip it with:\n  tar czf op-export.tar.gz -C "${resolve(out, '..')}" "${out.split('/').pop()}"`
  );
  return 0;
};
