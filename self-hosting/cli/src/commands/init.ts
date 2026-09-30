import { cpus } from 'node:os';
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
import { checkHost, DOCKER_INSTALL_COMMAND, type HostCheck } from '../host';
import {
  defaultAnswers,
  generateInstall,
  generateSecrets,
  hostOf,
  type InitAnswers,
} from '../init/generate';
import { isInstallDir, writeFiles } from '../install';
import { run } from '../run';
import { bold } from '../ui';
import { compose } from './compose';

export interface InitFlags {
  dir: string;
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

const defaultWorkers = () =>
  Math.max(Math.floor(cpus().length / 2), MIN_WORKERS);

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

export const init = async (flags: InitFlags): Promise<number> => {
  intro(bold('OpenPanel setup'));

  if (isInstallDir(flags.dir) && !flags.force) {
    clackLog.error(`${flags.dir} already has an install.`);
    clackLog.message(
      'Run `openpanel doctor` to check it, or `openpanel upgrade` to update it.\nUse --force to overwrite (originals are kept as .bak).'
    );
    return 1;
  }
  if (!(await ensureDocker(flags))) {
    return 1;
  }

  const answers = await askAnswers(flags);
  const secrets = generateSecrets();
  const written = await writeFiles(
    flags.dir,
    await generateInstall(answers, secrets)
  );

  note(
    [
      `Files:     ${written.length} written to ${flags.dir}`,
      `Dashboard: ${answers.domain}`,
      `Workers:   ${answers.workers}`,
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
    return compose('up', flags.dir);
  }
  outro(
    `Start it with: openpanel up${flags.dir === process.cwd() ? '' : ` --dir ${flags.dir}`}`
  );
  return 0;
};
