import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { compose, isComposeCommand } from './commands/compose';
import { doctor } from './commands/doctor';
import { exportData } from './commands/export';
import { init } from './commands/init';
import { reset } from './commands/reset';
import { upgrade } from './commands/upgrade';
import {
  DEFAULT_INSTALL_DIR,
  discoverInstall,
  type Resolution,
  rememberDir,
} from './install-dir';
import { dim, log, red } from './ui';
import { CHECK_TIMEOUT_MS, startUpdateCheck } from './update-notice';
import { VERSION } from './version';

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
  --dir <path>               Install directory. Without it the CLI looks in the
                             current dir, ./self-hosting, the last install it
                             used, and running stacks. init defaults to ~/openpanel
  -h, --help                 Show this help
  -v, --version              Show the version
`;

const EXPLICIT_SOURCES = new Set(['--dir', 'OPENPANEL_DIR']);

const describeNone = (searched: string[]) =>
  `No OpenPanel install found. Looked in:\n${[...new Set(searched)].map((path) => `  ${path}`).join('\n')}\nRun \`openpanel init\`, or point at yours with --dir <path>.`;

// Says which install a command acts on, since that is no longer always the cwd.
const locateInstall = async (flag: string | undefined): Promise<Resolution> => {
  const resolution = await discoverInstall(flag);
  if (resolution.kind === 'ambiguous') {
    const list = resolution.candidates.map((dir) => `  ${dir}`).join('\n');
    throw new Error(
      `Found ${resolution.candidates.length} OpenPanel installs:\n${list}\nChoose one with --dir <path> (or set OPENPANEL_DIR).`
    );
  }
  if (resolution.kind === 'found') {
    process.stderr.write(
      `${dim(`Using ${resolution.dir} (${resolution.source})`)}\n`
    );
    if (!EXPLICIT_SOURCES.has(resolution.source)) {
      await rememberDir(resolution.dir);
    }
  }
  return resolution;
};

const requireInstall = async (flag: string | undefined): Promise<string> => {
  const resolution = await locateInstall(flag);
  if (resolution.kind !== 'found') {
    throw new Error(
      describeNone(resolution.kind === 'none' ? resolution.searched : [])
    );
  }
  return resolution.dir;
};

const initDir = (flag: string | undefined) => {
  if (flag) {
    return { dir: resolve(flag), explicit: true };
  }
  if (process.env.OPENPANEL_DIR) {
    return { dir: resolve(process.env.OPENPANEL_DIR), explicit: true };
  }
  return { dir: DEFAULT_INSTALL_DIR, explicit: false };
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
      'queue-drained': { type: 'boolean', default: false },
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

  // `upgrade` does its own (authoritative) check.
  const updateCheck =
    command === 'upgrade' ? Promise.resolve() : startUpdateCheck(VERSION);
  const code = await route(command, rest, values);
  // A slow or offline network must not hold up the command's own exit.
  await Promise.race([updateCheck, Bun.sleep(CHECK_TIMEOUT_MS)]);
  return code;
};

const route = async (
  command: string,
  rest: string[],
  values: Flags
): Promise<number> => {
  if (command === 'init') {
    return init({
      ...initDir(values.dir),
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
  if (command === 'doctor') {
    const resolution = await locateInstall(values.dir);
    return doctor({
      dir: resolution.kind === 'found' ? resolution.dir : null,
      missingMessage:
        resolution.kind === 'none' ? describeNone(resolution.searched) : '',
      fix: values.fix,
      check: values.check,
    });
  }
  if (command === 'upgrade') {
    return upgrade({
      dir: await requireInstall(values.dir),
      yes: values.yes,
      queueDrained: values['queue-drained'],
      noSelfUpdate: values['no-self-update'],
    });
  }
  if (command === 'reset') {
    return reset({ dir: await requireInstall(values.dir), yes: values.yes });
  }
  if (isComposeCommand(command)) {
    return compose(command, await requireInstall(values.dir), rest);
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
