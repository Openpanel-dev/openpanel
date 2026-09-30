import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { compose, isComposeCommand } from './commands/compose';
import { doctor } from './commands/doctor';
import { isInstallDir } from './install';
import { log } from './ui';

const VERSION = '0.1.0';
const DEFAULT_DIR = join(homedir(), 'openpanel');

const HELP = `openpanel ${VERSION} — run and maintain a self-hosted OpenPanel

Usage: openpanel <command> [options]

Commands:
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

const main = async (): Promise<number> => {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      dir: { type: 'string' },
      fix: { type: 'boolean', default: false },
      check: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
  });
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
  if (command === 'doctor') {
    return doctor({ dir, fix: values.fix, check: values.check });
  }
  if (isComposeCommand(command)) {
    return compose(command, dir, rest);
  }

  log(`Unknown command "${command}".\n\n${HELP}`);
  return 1;
};

process.exit(await main());
