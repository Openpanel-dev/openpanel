import { password } from 'bun';
import { randomBytes } from 'node:crypto';
import { parseDocument } from 'yaml';
import type { EnvFile } from '../env-file';
import {
  DEFAULT_EVENTS_TOPIC_PARTITIONS,
  renderRedpandaBootstrap,
  STACK_IMAGE_TAG,
  templates,
} from '../templates';

const OPENPANEL_IMAGE_SERVICES = [
  'op-api',
  'op-dashboard',
  'op-worker',
] as const;

const BCRYPT_COST = 10;
const SECRET_BYTES = { cookie: 16, encryption: 32, admin: 12 } as const;

export const BUNDLED_URLS = {
  clickhouse: 'http://op-ch:8123/openpanel',
  redis: 'redis://op-kv:6379',
  postgres: 'postgresql://postgres:postgres@op-db:5432/postgres?schema=public',
} as const;

type DataService = keyof typeof BUNDLED_URLS;

// The compose service (and its volume prefix) behind each data service.
const COMPOSE_SERVICE: Record<DataService, string> = {
  clickhouse: 'op-ch',
  redis: 'op-kv',
  postgres: 'op-db',
};

export interface InitAnswers {
  // https://analytics.example.com, no trailing slash
  domain: string;
  // A URL means "use mine"; absent means install the bundled one.
  external: Partial<Record<DataService, string>>;
  proxy: 'caddy' | 'external';
  workers: number;
  partitions: number;
  resendApiKey?: string;
  emailSender?: string;
}

export interface Secrets {
  cookieSecret: string;
  encryptionKey: string;
  adminPassword: string;
}

// Values already in an existing .env win, so regenerating never rotates them.
export const generateSecrets = (existing: EnvFile | null = null): Secrets => ({
  cookieSecret:
    existing?.get('COOKIE_SECRET') ??
    randomBytes(SECRET_BYTES.cookie).toString('hex'),
  encryptionKey:
    existing?.get('ENCRYPTION_KEY') ??
    randomBytes(SECRET_BYTES.encryption).toString('hex'),
  adminPassword:
    existing?.get('ADMIN_PASSWORD') ??
    randomBytes(SECRET_BYTES.admin).toString('hex'),
});

export const hostOf = (domain: string): string =>
  domain.replace(/^https?:\/\//, '');

// Values can contain `$` (bcrypt hashes do), so never pass them as the
// replacement string, where `$&` and friends are special.
const fill = (text: string, values: Record<string, string>): string =>
  Object.entries(values).reduce(
    (result, [name, value]) => result.replaceAll(`$${name}`, () => value),
    text
  );

const renderEnv = (answers: InitAnswers, secrets: Secrets): string => {
  const urlFor = (service: DataService) =>
    answers.external[service] ?? BUNDLED_URLS[service];
  const filled = fill(templates.env, {
    // Longest names first: `$DATABASE_URL_DIRECT` must not be eaten by `$DATABASE_URL`.
    DATABASE_URL_DIRECT: urlFor('postgres'),
    DATABASE_URL: urlFor('postgres'),
    CLICKHOUSE_URL: urlFor('clickhouse'),
    REDIS_URL: urlFor('redis'),
    DASHBOARD_URL: answers.domain,
    API_URL: `${answers.domain}/api`,
    COOKIE_SECRET: secrets.cookieSecret,
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD: secrets.adminPassword,
    ENCRYPTION_KEY: secrets.encryptionKey,
    RESEND_API_KEY: answers.resendApiKey ?? '',
    EMAIL_SENDER: answers.emailSender ?? '',
    KAFKA_EVENTS_TOPIC_PARTITIONS: String(answers.partitions),
  });
  // An empty value means "unset"; drop the line instead of writing KEY="".
  return filled
    .split('\n')
    .filter((line) => !line.includes('=""'))
    .join('\n');
};

const removeService = (
  compose: ReturnType<typeof parseDocument>,
  name: string
) => {
  compose.deleteIn(['services', name]);
  const services = compose.getIn(['services'], true) as {
    items: { key: { value: string } }[];
  };
  for (const { key } of services.items) {
    const dependsOn = ['services', key.value, 'depends_on'];
    if (compose.hasIn(dependsOn)) {
      compose.deleteIn([...dependsOn, name]);
    }
  }
  const volumes = compose.getIn(['volumes'], true) as
    | { items: { key: { value: string } }[] }
    | undefined;
  for (const { key } of volumes?.items ?? []) {
    if (key.value.startsWith(name)) {
      compose.deleteIn(['volumes', key.value]);
    }
  }
};

const renderCompose = (answers: InitAnswers): string => {
  const compose = parseDocument(templates.compose);
  for (const service of Object.keys(answers.external) as DataService[]) {
    removeService(compose, COMPOSE_SERVICE[service]);
  }
  if (answers.proxy === 'external') {
    removeService(compose, 'op-proxy');
  }
  // A release CLI pins its own version; a dev build keeps the template's tag.
  for (const service of STACK_IMAGE_TAG === null
    ? []
    : OPENPANEL_IMAGE_SERVICES) {
    const image = String(compose.getIn(['services', service, 'image']) ?? '');
    const repository = image.split(':')[0];
    if (compose.hasIn(['services', service]) && repository) {
      compose.setIn(
        ['services', service, 'image'],
        `${repository}:${STACK_IMAGE_TAG}`
      );
    }
  }
  // Interpolated by compose from .env, so scaling is one edit and `up -d`.
  compose.setIn(
    ['services', 'op-worker', 'deploy', 'replicas'],
    `\${OP_WORKER_REPLICAS:-${answers.workers}}`
  );
  return compose.toString({ flowCollectionPadding: false, lineWidth: 0 });
};

const renderCaddyfile = async (
  answers: InitAnswers,
  secrets: Secrets
): Promise<string> => {
  const hash = await password.hash(secrets.adminPassword, {
    algorithm: 'bcrypt',
    cost: BCRYPT_COST,
  });
  const host = hostOf(answers.domain);
  return fill(templates.caddy, {
    DOMAIN_NAME: host,
    BASIC_AUTH_PASSWORD: hash,
    SSL_CONFIG: host.includes('localhost:443') ? '\n\ttls internal' : '',
  });
};

// Everything `init` writes, keyed by path relative to the install dir.
export const generateInstall = async (
  answers: InitAnswers,
  secrets: Secrets
): Promise<Map<string, string>> => {
  const files = new Map<string, string>([
    ['.env', renderEnv(answers, secrets)],
    ['docker-compose.yml', renderCompose(answers)],
    ['redpanda/bootstrap.yaml', renderRedpandaBootstrap(answers.partitions)],
  ]);
  if (!answers.external.clickhouse) {
    files.set('clickhouse/clickhouse-config.xml', templates.clickhouseConfig);
    files.set(
      'clickhouse/clickhouse-user-config.xml',
      templates.clickhouseUserConfig
    );
    files.set('clickhouse/init-db.sh', templates.clickhouseInit);
  }
  if (answers.proxy === 'caddy') {
    files.set('caddy/Caddyfile', await renderCaddyfile(answers, secrets));
  }
  return files;
};

export const defaultAnswers = (domain: string): InitAnswers => ({
  domain,
  external: {},
  proxy: 'caddy',
  workers: 1,
  partitions: DEFAULT_EVENTS_TOPIC_PARTITIONS,
});
