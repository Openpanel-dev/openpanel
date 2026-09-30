import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { compose, isComposeCommand } from './commands/compose';
import { doctor } from './commands/doctor';
import { exportData } from './commands/export';
import { init } from './commands/init';
import { reset } from './commands/reset';
import { upgrade } from './commands/upgrade';
import { isInstallDir } from './install';
import { log, red } from './ui';
import { CHECK_TIMEOUT_MS, startUpdateCheck } from './update-notice';
import { VERSION } from './version';

const DEFAULT_DIR = join(homedir(), 'openpanel');

const HELP = `openpanel ${VERSION} — run and maintain a self-hosted OpenPanel

Usage: openpanel <command> [options]

Commands:
  init                       Interactive setup (--yes --domain <url> to skip prompts)
  upgrade [--yes]            Update the CLI, repair the install, pull images, restart
  export [--out <dir>]       Dump ClickHouse data as JSONL (e.g. to move to Cloud)
  reset [--yes]              Delete this install's data volumes (asks first)
  doctor [--fix] [--check]   Check the host and your install; --fix repairs it
  up | down | restart        Start, stop, or recreate the stack
  logs [service]             Follow logs
  status                     Show running services

Options:
  --dir <path>               Install directory (default: current dir if it has
                             a docker-compose.yml, else ~/openpanel)
  -h, --help                 Show this help
  -v, --version              Show the version
`;

// A user standing in their install dir should not have to say so.
const resolveDir = (flag: string | undefined): string => {
  if (flag) {
    return resolve(flag);
  }
  if (process.env.OPENPANEL_DIR) {
    return resolve(process.env.OPENPANEL_DIR);
  }
  return isInstallDir(process.cwd()) ? process.cwd() : DEFAULT_DIR;
};

const parseFlags = () =>
  parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      dir: { type: 'string' },
      fix: { type: 'boolean', default: false },
      yes: { type: 'boolean', short: 'y', default: false },
      force: { type: 'boolean', default: false },
      'no-self-update': { type: 'boolean', default: false },
      container: { type: 'string' },
      out: { type: 'string' },
      'project-id': { type: 'string' },
      from: { type: 'string' },
      to: { type: 'string' },
      tables: { type: 'string' },
      'rows-per-file': { type: 'string' },
      db: { type: 'string' },
      list: { type: 'boolean', default: false },
      'no-gzip': { type: 'boolean', default: false },
      domain: { type: 'string' },
      proxy: { type: 'string' },
      workers: { type: 'string' },
      partitions: { type: 'string' },
      'postgres-url': { type: 'string' },
      'clickhouse-url': { type: 'string' },
      'redis-url': { type: 'string' },
      'resend-key': { type: 'string' },
      'email-sender': { type: 'string' },
      check: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
  });

type Flags = ReturnType<typeof parseFlags>['values'];

const main = async (): Promise<number> => {
  const { values, positionals } = parseFlags();
  const [command, ...rest] = positionals;

  if (values.version) {
    log(VERSION);
    return 0;
  }
  if (values.help || !command) {
    log(HELP);
    return 0;
  }

  const dir = resolveDir(values.dir);
  // `upgrade` does its own (authoritative) check.
  const updateCheck =
    command === 'upgrade' ? Promise.resolve() : startUpdateCheck(VERSION);
  const code = await route(command, rest, values, dir);
  // A slow or offline network must not hold up the command's own exit.
  await Promise.race([updateCheck, Bun.sleep(CHECK_TIMEOUT_MS)]);
  return code;
};

const route = async (
  command: string,
  rest: string[],
  values: Flags,
  dir: string
): Promise<number> => {
  if (command === 'init') {
    return init({
      dir,
      yes: values.yes,
      force: values.force,
      domain: values.domain,
      proxy: values.proxy,
      workers: values.workers,
      partitions: values.partitions,
      postgresUrl: values['postgres-url'],
      clickhouseUrl: values['clickhouse-url'],
      redisUrl: values['redis-url'],
      resendKey: values['resend-key'],
      emailSender: values['email-sender'],
    });
  }
  if (command === 'export') {
    return exportData({
      container: values.container,
      out: values.out ?? './op-export',
      projectId: values['project-id'],
      from: values.from,
      to: values.to,
      tables: values.tables,
      rowsPerFile: values['rows-per-file'],
      db: values.db ?? 'openpanel',
      list: values.list,
      noGzip: values['no-gzip'],
    });
  }
  if (command === 'reset') {
    return reset({ dir, yes: values.yes });
  }
  if (command === 'upgrade') {
    return upgrade({
      dir,
      yes: values.yes,
      noSelfUpdate: values['no-self-update'],
    });
  }
  if (command === 'doctor') {
    return doctor({ dir, fix: values.fix, check: values.check });
  }
  if (isComposeCommand(command)) {
    return compose(command, dir, rest);
  }

  log(`Unknown command "${command}".\n\n${HELP}`);
  return 1;
};

try {
  process.exit(await main());
} catch (error) {
  // Expected failures (bad flag, no container) are a message, not a stack trace.
  console.error(`${red('error')} ${(error as Error).message}`);
  process.exit(1);
}
