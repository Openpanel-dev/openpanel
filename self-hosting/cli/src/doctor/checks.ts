import { randomBytes } from 'node:crypto';
import { type Document, isAlias, isMap, isSeq, parseDocument } from 'yaml';
import { isNewer } from '../self-update';
import {
  DEFAULT_EVENTS_TOPIC_PARTITIONS,
  renderRedpandaBootstrap,
  STACK_IMAGE_TAG,
  templates,
} from '../templates';
import type { Check, Install } from './types';

const ENCRYPTION_KEY_PATTERN = /^[0-9a-f]{64}$/i;
const BOOTSTRAP_PATH = 'redpanda/bootstrap.yaml';
const WORKER_READY_PATH = '/healthz/ready';
const REDIS_DRAIN_NOTE =
  'Events still queued in Redis by the old worker are not moved to Redpanda. Stop sending traffic and let the old worker drain (watch `/bullboard`) before you switch.';

// Env vars v3 no longer reads; leaving them is harmless but misleading.
const REMOVED_ENV_VARS = [
  'WORKER_PORT',
  'EVENT_JOB_CONCURRENCY',
  'EVENTS_GROUP_QUEUES_SHARDS',
  'EVENT_BLOCKING_TIMEOUT_SEC',
  'ORDERING_DELAY_MS',
  'AUTO_BATCH_SIZE',
  'AUTO_BATCH_MAX_WAIT_MS',
  'SHUTDOWN_GRACE_PERIOD_MS',
  'FUNNEL_NON_STRICT_ORDERING',
  'CHART_VALUES_LOOKBACK_DAYS',
] as const;

// Renamed in 2.0; a pre-2.0 .env may still carry only the old name.
const RENAMED_ENV_VARS = [
  ['NEXT_PUBLIC_DASHBOARD_URL', 'DASHBOARD_URL'],
  ['NEXT_PUBLIC_API_URL', 'API_URL'],
  ['NEXT_PUBLIC_SELF_HOSTED', 'SELF_HOSTED'],
] as const;
const BUNDLED_KAFKA_HOST = 'op-rp:';

const templateCompose = parseDocument(templates.compose);

const randomHex = (bytes: number) => randomBytes(bytes).toString('hex');

const hasService = (install: Install, name: string) =>
  install.compose.hasIn(['services', name]);

const serviceImage = (install: Install, name: string) => {
  const image = install.compose.getIn(['services', name, 'image']);
  return typeof image === 'string' ? image : undefined;
};

const envEntries = (install: Install, service: string): string[] => {
  const environment = install.compose.getIn([
    'services',
    service,
    'environment',
  ]);
  if (isSeq(environment)) {
    return environment.items.map((item) =>
      String((item as { value?: unknown }).value ?? item)
    );
  }
  if (isMap(environment)) {
    return environment.items.map((pair) => {
      const key = String((pair.key as { value?: unknown }).value ?? pair.key);
      const value = (pair.value as { value?: unknown } | null)?.value;
      return `${key}=${value ?? ''}`;
    });
  }
  return [];
};

const hasWorkerRole = (install: Install) =>
  envEntries(install, 'op-worker').includes('ROLE=worker');

const dependsOnPath = (service: string) => ['services', service, 'depends_on'];

// depends_on comes as a map (with conditions), a plain list, or a YAML alias
// shared between services; all three are valid compose.
const dependencyNames = (compose: Document, service: string): string[] => {
  const node = compose.getIn(dependsOnPath(service), true);
  const resolved = isAlias(node) ? node.resolve(compose) : node;
  if (isMap(resolved)) {
    return resolved.items.map((pair) =>
      String((pair.key as { value?: unknown }).value ?? pair.key)
    );
  }
  if (isSeq(resolved)) {
    return resolved.items.map((item) =>
      String((item as { value?: unknown }).value ?? item)
    );
  }
  return [];
};

const addDependency = (
  compose: Document,
  service: string,
  dependency: string
) => {
  const path = dependsOnPath(service);
  if (dependencyNames(compose, service).includes(dependency)) {
    return;
  }
  const node = compose.getIn(path, true);
  // Editing an alias would change every service sharing the anchor, so this
  // service gets its own copy first.
  if (isAlias(node)) {
    compose.setIn(path, compose.createNode(node.resolve(compose)?.toJSON()));
  }
  const current = compose.getIn(path, true);
  if (isSeq(current)) {
    current.add(dependency);
    return;
  }
  compose.setIn(
    [...path, dependency],
    compose.createNode({ condition: 'service_healthy' })
  );
};

// External Kafka (KAFKA_BROKERS pointing elsewhere) means no bundled Redpanda.
const usesBundledKafka = (install: Install) => {
  const brokers = install.env.get('KAFKA_BROKERS');
  return (
    !brokers ||
    brokers
      .split(',')
      .some((broker) => broker.trim().startsWith(BUNDLED_KAFKA_HOST))
  );
};

const isLegacyWorkerImage = (install: Install) =>
  (serviceImage(install, 'op-worker') ?? '').includes('openpanel-worker');

export const redpandaService: Check = (install) => {
  if (hasService(install, 'op-rp') || !usesBundledKafka(install)) {
    return null;
  }
  return {
    id: 'compose/redpanda-service',
    severity: 'error',
    title: 'Redpanda (op-rp) is missing from docker-compose.yml',
    detail:
      'Events are always produced to Kafka now; without op-rp the api refuses to start.',
    fix: (target) => {
      const service = templateCompose.getIn(['services', 'op-rp'], true);
      const volume = templateCompose.getIn(['volumes', 'op-rp-data'], true);
      target.compose.setIn(['services', 'op-rp'], service);
      target.compose.setIn(['volumes', 'op-rp-data'], volume);
      for (const name of ['op-api', 'op-worker']) {
        if (hasService(target, name)) {
          addDependency(target.compose, name, 'op-rp');
        }
      }
    },
  };
};

export const redpandaBootstrapFile: Check = (install) => {
  const needsBootstrap =
    hasService(install, 'op-rp') || usesBundledKafka(install);
  const kind = install.fileKind(BOOTSTRAP_PATH);
  if (!needsBootstrap || kind === 'file') {
    return null;
  }
  if (kind === 'directory') {
    return {
      id: 'files/redpanda-bootstrap',
      severity: 'error',
      title: `${BOOTSTRAP_PATH} is a directory`,
      detail:
        'Docker creates a directory when a bind-mounted file is missing at start, and op-rp then cannot read its config.',
      manual: `Remove it (it is usually root-owned): sudo rm -rf ${BOOTSTRAP_PATH}, then run \`openpanel doctor --fix\`.`,
    };
  }
  return {
    id: 'files/redpanda-bootstrap',
    severity: 'error',
    title: `${BOOTSTRAP_PATH} is missing`,
    detail:
      'op-rp bind-mounts this file; docker compose fails to start without it.',
    fix: (target) => {
      const configured = Number(
        target.env.get('KAFKA_EVENTS_TOPIC_PARTITIONS')
      );
      const partitions =
        Number.isInteger(configured) && configured > 0
          ? configured
          : DEFAULT_EVENTS_TOPIC_PARTITIONS;
      target.files.set(BOOTSTRAP_PATH, renderRedpandaBootstrap(partitions));
    },
  };
};

const OPENPANEL_IMAGE = /^(lindesvard\/openpanel-(?:api|dashboard)):(.+)$/;
const IMAGE_SERVICES = ['op-api', 'op-dashboard', 'op-worker'] as const;

const EXACT_VERSION = /^\d+\.\d+\.\d+$/;

// An image already on the CLI's version, or newer than it, is left alone: an
// older CLI must never downgrade a stack.
export const satisfiesStack = (tag: string, stack: string): boolean => {
  if (tag === stack) {
    return true;
  }
  const bothExact = EXACT_VERSION.test(tag) && EXACT_VERSION.test(stack);
  return bothExact && isNewer(tag, stack);
};

const staleImages = (install: Install, stack: string) =>
  IMAGE_SERVICES.flatMap((service) => {
    const image = serviceImage(install, service);
    const match = image ? OPENPANEL_IMAGE.exec(image) : null;
    const [, repository, tag] = match ?? [];
    return repository && tag && !satisfiesStack(tag, stack)
      ? [{ service, repository, tag }]
      : [];
  });

// The CLI owns the OpenPanel image tag, pinned versions included: the compose
// changes it makes only work with the images it was released for. Images from
// other registries (supporter builds, forks) are never touched, and neither is
// anything when there is no version to target (a dev build).
export const imageTagFor =
  (stack: string | null): Check =>
  (install) => {
    if (stack === null) {
      return null;
    }
    const stale = staleImages(install, stack);
    if (stale.length === 0) {
      return null;
    }
    const changes = stale
      .map(({ service, tag }) => `${service} ${tag} → ${stack}`)
      .join(', ');
    return {
      id: 'compose/image-tag',
      severity: 'error',
      title: `OpenPanel images move to :${stack} (${changes})`,
      detail: `This CLI release targets :${stack}; the compose changes it makes only work with those images.`,
      fix: (target) => {
        for (const { service, repository } of staleImages(target, stack)) {
          target.compose.setIn(
            ['services', service, 'image'],
            `${repository}:${stack}`
          );
        }
      },
    };
  };

export const imageTag = imageTagFor(STACK_IMAGE_TAG);

export const workerImage: Check = (install) => {
  if (!isLegacyWorkerImage(install)) {
    return null;
  }
  return {
    id: 'compose/worker-image',
    severity: 'error',
    title: 'op-worker still uses the separate openpanel-worker image',
    detail:
      'That image is no longer built. The worker is the api image started with ROLE=worker.',
    fix: (target) => {
      const apiImage = serviceImage(target, 'op-api');
      const fallback = templateCompose.getIn([
        'services',
        'op-worker',
        'image',
      ]);
      target.compose.setIn(
        ['services', 'op-worker', 'image'],
        apiImage ?? fallback
      );
    },
  };
};

export const workerRole: Check = (install) => {
  if (!hasService(install, 'op-worker') || hasWorkerRole(install)) {
    return null;
  }
  return {
    id: 'compose/worker-role',
    severity: 'error',
    title: 'op-worker has no ROLE=worker',
    detail: 'Without it the api image starts as an api server, not a worker.',
    fix: (target) => {
      const path = ['services', 'op-worker', 'environment'];
      const environment = target.compose.getIn(path);
      if (isMap(environment)) {
        target.compose.setIn([...path, 'ROLE'], 'worker');
        return;
      }
      if (isSeq(environment)) {
        environment.add('ROLE=worker');
        return;
      }
      target.compose.setIn(path, target.compose.createNode(['ROLE=worker']));
    },
  };
};

const REPLICAS_PATH = ['services', 'op-worker', 'deploy', 'replicas'];

// Installs from before the CLI have a literal count; the variable form lets
// OP_WORKER_REPLICAS in .env change it without editing compose.
export const workerReplicas: Check = (install) => {
  const replicas = install.compose.getIn(REPLICAS_PATH);
  if (typeof replicas !== 'number') {
    return null;
  }
  return {
    id: 'compose/worker-replicas',
    severity: 'info',
    title: `op-worker replica count is fixed at ${replicas}`,
    detail:
      'Switching to the OP_WORKER_REPLICAS variable keeps the count and makes it settable from .env.',
    fix: (target) =>
      target.compose.setIn(
        REPLICAS_PATH,
        `\${OP_WORKER_REPLICAS:-${replicas}}`
      ),
  };
};

export const workerHealthcheck: Check = (install) => {
  if (!hasService(install, 'op-worker')) {
    return null;
  }
  const test = install.compose.getIn([
    'services',
    'op-worker',
    'healthcheck',
    'test',
  ]);
  const hasReadyProbe = JSON.stringify(test ?? '').includes(WORKER_READY_PATH);
  if (hasReadyProbe) {
    return null;
  }
  return {
    id: 'compose/worker-healthcheck',
    severity: 'warn',
    title: `op-worker healthcheck does not probe ${WORKER_READY_PATH}`,
    detail:
      "The worker process serves its own readiness probe; /healthcheck is the api's.",
    fix: (target) => {
      const probe = templateCompose.getIn([
        'services',
        'op-worker',
        'healthcheck',
        'test',
      ]);
      target.compose.setIn(
        ['services', 'op-worker', 'healthcheck', 'test'],
        probe
      );
    },
  };
};

export const apiMigrations: Check = (install) => {
  const command = install.compose.getIn(['services', 'op-api', 'command']);
  if (
    typeof command !== 'string' ||
    command.includes('scripts/migrate-code.ts')
  ) {
    return null;
  }
  return {
    id: 'compose/api-migrations',
    severity: 'error',
    title: 'op-api start command runs the old migration steps',
    detail:
      'v3 migrates with prisma + scripts/migrate-code.ts under bun; pnpm is gone from the image.',
    fix: (target) => {
      const next = templateCompose.getIn(['services', 'op-api', 'command']);
      target.compose.setIn(['services', 'op-api', 'command'], next);
    },
  };
};

export const kafkaBrokers: Check = (install) => {
  if (install.env.get('KAFKA_BROKERS')) {
    return null;
  }
  return {
    id: 'env/kafka-brokers',
    severity: 'error',
    title: 'KAFKA_BROKERS is not set',
    detail: 'Required to boot. The bundled Redpanda listens on op-rp:9092.',
    fix: (target) => target.env.set('KAFKA_BROKERS', 'op-rp:9092'),
  };
};

export const kafkaPartitions: Check = (install) => {
  if (install.env.get('KAFKA_EVENTS_TOPIC_PARTITIONS')) {
    return null;
  }
  return {
    id: 'env/kafka-partitions',
    severity: 'warn',
    title: 'KAFKA_EVENTS_TOPIC_PARTITIONS is not set',
    detail:
      'Read once when the events topic is first created; changing it later reshuffles key ordering.',
    fix: (target) =>
      target.env.set(
        'KAFKA_EVENTS_TOPIC_PARTITIONS',
        String(DEFAULT_EVENTS_TOPIC_PARTITIONS)
      ),
  };
};

export const encryptionKey: Check = (install) => {
  const value = install.env.get('ENCRYPTION_KEY');
  if (value && ENCRYPTION_KEY_PATTERN.test(value)) {
    return null;
  }
  if (value) {
    return {
      id: 'env/encryption-key',
      severity: 'error',
      title: 'ENCRYPTION_KEY is not 64 hex characters',
      detail:
        'It guards stored credentials (2FA, Search Console, exports), so doctor will not replace an existing value.',
      manual:
        'Generate a replacement with `openssl rand -hex 32` only if you have nothing encrypted yet.',
    };
  }
  return {
    id: 'env/encryption-key',
    severity: 'error',
    title: 'ENCRYPTION_KEY is not set',
    detail:
      'Needed for 2FA, Google Search Console and export credentials; must match on api and worker.',
    fix: (target) => target.env.set('ENCRYPTION_KEY', randomHex(32)),
  };
};

export const cookieSecret: Check = (install) => {
  if (install.env.get('COOKIE_SECRET')) {
    return null;
  }
  return {
    id: 'env/cookie-secret',
    severity: 'error',
    title: 'COOKIE_SECRET is not set',
    detail: 'Signs unsubscribe links and unlocks password-protected shares.',
    fix: (target) => target.env.set('COOKIE_SECRET', randomHex(16)),
  };
};

export const renamedEnvVars: Check = (install) => {
  const present = RENAMED_ENV_VARS.filter(([oldName]) =>
    install.env.has(oldName)
  );
  if (present.length === 0) {
    return null;
  }
  return {
    id: 'env/renamed-vars',
    severity: 'error',
    title: `Old variable names in .env: ${present.map(([oldName]) => oldName).join(', ')}`,
    detail:
      'Renamed in 2.0. Their values are moved to the new names unless those are already set.',
    fix: (target) => {
      for (const [oldName, newName] of present) {
        const value = target.env.get(oldName);
        if (value && !target.env.get(newName)) {
          target.env.set(newName, value);
        }
        target.env.remove(oldName);
      }
    },
  };
};

export const apiUrl: Check = (install) => {
  if (install.env.get('API_URL')) {
    return null;
  }
  const dashboard = install.env.get('DASHBOARD_URL');
  return {
    id: 'env/api-url',
    severity: 'error',
    title: 'API_URL is not set',
    detail:
      'The dashboard calls the api at this address; without it every request fails.',
    manual: dashboard
      ? `With the bundled Caddy it is ${dashboard}/api. Set API_URL to that, or to wherever your proxy serves the api.`
      : 'Set API_URL to the public address of the api, e.g. https://analytics.example.com/api.',
  };
};

export const dashboardUrl: Check = (install) => {
  if (install.env.get('DASHBOARD_URL')) {
    return null;
  }
  return {
    id: 'env/dashboard-url',
    severity: 'error',
    title: 'DASHBOARD_URL is not set',
    detail:
      'It seeds the CORS allowlist for the dashboard; without it every dashboard request is rejected.',
    manual:
      'Set DASHBOARD_URL to the exact origin you open in the browser, e.g. https://analytics.example.com.',
  };
};

export const adminCredentials: Check = (install) => {
  const hasUsername = Boolean(install.env.get('ADMIN_USERNAME'));
  const hasPassword = Boolean(install.env.get('ADMIN_PASSWORD'));
  if (hasUsername === hasPassword) {
    return null;
  }
  return {
    id: 'env/admin-credentials',
    severity: 'error',
    title: 'ADMIN_USERNAME and ADMIN_PASSWORD must be set together',
    detail: 'Setting only one fails boot.',
    manual: 'Set both, or remove the one that is set.',
  };
};

export const selfHosted: Check = (install) => {
  const value = install.env.get('SELF_HOSTED');
  if (value === 'true' || value === '1') {
    return null;
  }
  return {
    id: 'env/self-hosted',
    severity: 'warn',
    title: `SELF_HOSTED is ${value === undefined ? 'not set' : `"${value}"`}`,
    detail:
      'Only `true` or `1` turns self-hosted mode on in the api and worker.',
    fix: (target) => target.env.set('SELF_HOSTED', 'true'),
  };
};

export const enabledQueues: Check = (install) => {
  const value = install.env.get('ENABLED_QUEUES');
  if (!value) {
    return null;
  }
  const tokens = value.split(',').map((token) => token.trim());
  const isStale = tokens.includes('events_kafka') || tokens.includes('misc');
  if (!isStale) {
    return null;
  }
  return {
    id: 'env/enabled-queues',
    severity: 'error',
    title: 'ENABLED_QUEUES lists queues that no longer exist',
    detail:
      '`events_kafka` was renamed `events` and `misc` was removed; unknown names fail boot.',
    fix: (target) => {
      const next = tokens
        .filter((token) => token !== 'misc')
        .map((token) => (token === 'events_kafka' ? 'events' : token));
      target.env.set('ENABLED_QUEUES', [...new Set(next)].join(','));
    },
  };
};

export const removedEnvVars: Check = (install) => {
  const present = REMOVED_ENV_VARS.filter((key) => install.env.has(key));
  if (present.length === 0) {
    return null;
  }
  return {
    id: 'env/removed-vars',
    severity: 'info',
    title: `Unused variables in .env: ${present.join(', ')}`,
    detail: 'v3 no longer reads these.',
    fix: (target) => {
      for (const key of present) {
        target.env.remove(key);
      }
    },
  };
};

const WORKER_BLOCK_PROXY = 'reverse_proxy op-worker:3000';
const BULLBOARD_REDIRECT = 'redir / /bullboard/';

export const caddyBullboardRedirect: Check = (install) => {
  const caddyfile = install.caddyfile;
  if (caddyfile === null) {
    return null;
  }
  const hasWorkerBlock = caddyfile.includes(WORKER_BLOCK_PROXY);
  const hasRedirect = caddyfile.includes(BULLBOARD_REDIRECT);
  if (!hasWorkerBlock || hasRedirect) {
    return null;
  }
  return {
    id: 'caddy/bullboard-redirect',
    severity: 'warn',
    title: 'worker.<domain> has no redirect to /bullboard/',
    detail:
      "Bull-board moved from `/` to `/bullboard` on the worker's single port.",
    fix: (target) => {
      target.caddyfile = (target.caddyfile ?? '').replace(
        /^(\s*)reverse_proxy op-worker:3000/m,
        `$1${BULLBOARD_REDIRECT}\n\n$1${WORKER_BLOCK_PROXY}`
      );
    },
  };
};

// Reminder, not a repair: surfaced only while the install still looks like it
// predates Kafka (old worker image, or no Redpanda while using the bundled one).
export const drainOldQueue: Check = (install) => {
  const missingBundledKafka =
    !hasService(install, 'op-rp') && usesBundledKafka(install);
  const looksLikeV1 = isLegacyWorkerImage(install) || missingBundledKafka;
  if (!looksLikeV1) {
    return null;
  }
  return {
    id: 'upgrade/drain-old-queue',
    severity: 'warn',
    title: 'Drain the old event queue before switching',
    detail: REDIS_DRAIN_NOTE,
    manual:
      'Stop tracking traffic, wait until the events queue is empty, then run `openpanel upgrade`.',
  };
};

// Order matters for fixes: the worker image is swapped before its role is
// checked, op-rp is added before anything asks for its bootstrap file, and old
// env names are migrated before the new ones are checked.
export const checks: Check[] = [
  drainOldQueue,
  redpandaService,
  redpandaBootstrapFile,
  imageTag,
  workerImage,
  workerRole,
  workerReplicas,
  workerHealthcheck,
  apiMigrations,
  kafkaBrokers,
  kafkaPartitions,
  encryptionKey,
  cookieSecret,
  renamedEnvVars,
  dashboardUrl,
  apiUrl,
  adminCredentials,
  selfHosted,
  enabledQueues,
  removedEnvVars,
  caddyBullboardRedirect,
];
