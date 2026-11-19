import { readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join } from 'node:path';
import {
  cancel,
  log as clackLog,
  confirm,
  intro,
  isCancel,
  note,
  outro,
  select,
  text,
} from '@clack/prompts';
import { EnvFile } from '../env-file';
import { checkHost, DOCKER_INSTALL_COMMAND, type HostCheck } from '../host';
import {
  defaultAnswers,
  generateInstall,
  generateSecrets,
  hostOf,
  type InitAnswers,
} from '../init/generate';
import { isInstallDir, writeFiles } from '../install';
import { discoverInstall, isEmptyOrMissing, rememberDir } from '../install-dir';
import { run } from '../run';
import { showSupportBanner } from '../support-banner';
import { bold } from '../ui';
import { compose } from './compose';

export interface InitFlags {
  dir: string;
  // True when the user named the directory (--dir / OPENPANEL_DIR).
  explicit: boolean;
  yes: boolean;
  force: boolean;
  domain?: string;
  proxy?: string;
  workers?: string;
  partitions?: string;
  postgresUrl?: string;
  clickhouseUrl?: string;
  redisUrl?: string;
  resendKey?: string;
  emailSender?: string;
}

const MIN_WORKERS = 1;
// One or two workers carry most installs; more is a deliberate choice (--workers).
const MAX_DEFAULT_WORKERS = 2;

const defaultWorkers = () =>
  Math.min(
    Math.max(Math.floor(cpus().length / 2), MIN_WORKERS),
    MAX_DEFAULT_WORKERS
  );

const isHttpUrl = (value: string) => /^https?:\/\/[^\s/]+/.test(value);

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed >= MIN_WORKERS ? parsed : fallback;
};

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, '');

// Cancelling any prompt (Ctrl+C) ends the wizard cleanly instead of throwing.
const answer = <T>(value: T | symbol): T => {
  if (isCancel(value)) {
    cancel('Cancelled. Nothing was written.');
    process.exit(0);
  }
  return value as T;
};

const askUrl = async (label: string, example: string) =>
  answer(
    await text({
      message: `${label} URL`,
      placeholder: example,
      validate: (value) => (value?.trim() ? undefined : 'Required'),
    })
  );

const askExternal = async (
  flags: InitFlags
): Promise<InitAnswers['external']> => {
  const fromFlags = {
    postgres: flags.postgresUrl,
    clickhouse: flags.clickhouseUrl,
    redis: flags.redisUrl,
  };
  const given = Object.entries(fromFlags).filter(([, url]) => url);
  if (given.length > 0 || flags.yes) {
    return Object.fromEntries(given);
  }
  const useBundled = answer(
    await confirm({
      message: 'Run Postgres, ClickHouse and Redis in Docker for you?',
      initialValue: true,
    })
  );
  if (useBundled) {
    return {};
  }
  return {
    postgres: await askUrl('Postgres', 'postgresql://user:pw@host:5432/db'),
    clickhouse: await askUrl('ClickHouse', 'http://user:pw@host:8123/db'),
    redis: await askUrl('Redis', 'redis://user:pw@host:6379/0'),
  };
};

const askEmail = async (flags: InitFlags, host: string) => {
  if (flags.resendKey || flags.yes) {
    return { resendApiKey: flags.resendKey, emailSender: flags.emailSender };
  }
  const resendApiKey = answer(
    await text({
      message: 'Resend API key for sending email (optional, Enter to skip)',
    })
  );
  if (!resendApiKey) {
    return {};
  }
  const emailSender = answer(
    await text({
      message: 'Send email from',
      initialValue: `no-reply@${host}`,
      validate: (value) =>
        value?.includes('@') ? undefined : 'Enter an email',
    })
  );
  return { resendApiKey, emailSender };
};

const askAnswers = async (flags: InitFlags): Promise<InitAnswers> => {
  const domain = stripTrailingSlash(
    flags.domain ??
      answer(
        await text({
          message: 'Where will OpenPanel live?',
          placeholder: 'https://analytics.example.com',
          validate: (value) =>
            value && isHttpUrl(value)
              ? undefined
              : 'Start with http:// or https://',
        })
      )
  );
  if (!isHttpUrl(domain)) {
    throw new Error(
      `--domain must start with http:// or https:// (got "${domain}")`
    );
  }

  const external = await askExternal(flags);
  const proxy =
    flags.proxy ??
    (flags.yes
      ? 'caddy'
      : answer(
          await select({
            message: 'HTTPS and routing',
            options: [
              {
                value: 'caddy',
                label: 'Caddy, with automatic HTTPS',
                hint: 'recommended',
              },
              { value: 'external', label: 'I run my own reverse proxy' },
            ],
          })
        ));
  if (proxy !== 'caddy' && proxy !== 'external') {
    throw new Error(`--proxy must be "caddy" or "external" (got "${proxy}")`);
  }

  return {
    ...defaultAnswers(domain),
    external,
    proxy,
    workers: parsePositiveInt(flags.workers, defaultWorkers()),
    partitions: parsePositiveInt(
      flags.partitions,
      defaultAnswers(domain).partitions
    ),
    ...(await askEmail(flags, hostOf(domain))),
  };
};

const reportHostProblems = (results: HostCheck[]) => {
  for (const result of results.filter((check) => !check.ok)) {
    clackLog.error(result.title);
    if (result.hint) {
      clackLog.message(result.hint);
    }
  }
};

// Linux only, and only after showing the exact command: installing Docker is
// the user's call, not ours.
const offerDockerInstall = async (flags: InitFlags): Promise<boolean> => {
  const canOffer = process.platform === 'linux' && !flags.yes;
  if (!canOffer) {
    return false;
  }
  const command = DOCKER_INSTALL_COMMAND.at(-1) as string;
  const approved = answer(
    await confirm({
      message: `Install Docker now? This runs: ${command}`,
      initialValue: true,
    })
  );
  if (!approved) {
    return false;
  }
  return (await run(DOCKER_INSTALL_COMMAND, { inherit: true })).code === 0;
};

const ensureDocker = async (flags: InitFlags): Promise<boolean> => {
  let results = await checkHost();
  const dockerMissing = results.some(
    (check) => check.id === 'host/docker' && !check.ok
  );
  if (dockerMissing && (await offerDockerInstall(flags))) {
    results = await checkHost();
  }
  // Low RAM is a warning, not a blocker; everything else has to work.
  const blockers = results.filter(
    (check) => !check.ok && check.id !== 'host/memory'
  );
  reportHostProblems(results);
  return blockers.length === 0;
};

// Only Caddy publishes worker.<domain>; with your own proxy there is no URL to print.
const queueDashboardLines = (answers: InitAnswers, adminPassword: string) =>
  answers.proxy === 'caddy'
    ? [
        '',
        `Queue dashboard: https://worker.${hostOf(answers.domain)}/bullboard/`,
        '  user: admin',
        `  password: ${adminPassword} (also ADMIN_PASSWORD in .env)`,
      ]
    : [];

const readExistingEnv = (dir: string): EnvFile | null => {
  try {
    return new EnvFile(readFileSync(join(dir, '.env'), 'utf8'));
  } catch {
    return null;
  }
};

// Why init should not write here, or null when it may.
const targetProblem = async (flags: InitFlags): Promise<string | null> => {
  if (isInstallDir(flags.dir)) {
    return flags.force
      ? null
      : `${flags.dir} already has an install. Run \`openpanel doctor\` to check it or \`openpanel upgrade\` to update it. --force regenerates the files but keeps your secrets.`;
  }
  // Without --dir, an install elsewhere (say ~/openpanel/self-hosting from the
  // old git clone) is the likelier explanation than a user wanting a second one.
  if (!flags.explicit) {
    const existing = await discoverInstall();
    if (existing.kind === 'found') {
      return `You already have an install at ${existing.dir}. Use \`openpanel doctor\` / \`openpanel upgrade\` there, or pass --dir <path> to set up another one.`;
    }
  }
  if (!isEmptyOrMissing(flags.dir)) {
    return `${flags.dir} is not empty and is not an OpenPanel install (a git clone, perhaps). Choose another directory with --dir <path>.`;
  }
  return null;
};

export const init = async (flags: InitFlags): Promise<number> => {
  intro(bold('OpenPanel setup'));

  const problem = await targetProblem(flags);
  if (problem) {
    clackLog.error(problem);
    return 1;
  }
  if (!(await ensureDocker(flags))) {
    return 1;
  }

  const answers = await askAnswers(flags);
  // --force on a live install must not rotate secrets: the encryption key guards
  // stored credentials in databases that --force leaves in place.
  const secrets = generateSecrets(readExistingEnv(flags.dir));
  const written = await writeFiles(
    flags.dir,
    await generateInstall(answers, secrets)
  );

  await rememberDir(flags.dir);

  note(
    [
      `Files:     ${written.length} written to ${flags.dir}`,
      `Dashboard: ${answers.domain}`,
      `Workers:   ${answers.workers} (change with OP_WORKER_REPLICAS in .env)`,
      ...queueDashboardLines(answers, secrets.adminPassword),
    ].join('\n'),
    'Installed'
  );

  const start =
    !flags.yes &&
    answer(
      await confirm({ message: 'Start OpenPanel now?', initialValue: true })
    );
  if (start) {
    const code = await compose('up', flags.dir);
    if (code === 0) {
      showSupportBanner(null);
    }
    return code;
  }
  showSupportBanner(null);
  outro('Start it with: openpanel up');
  return 0;
};
