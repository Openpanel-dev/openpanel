import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The product's MCP on this worktree's API, authenticated with the seed's root client. */
function seededMcp(w: {
  dir: string;
  url(process: string): string;
}): Record<string, { url: string }> {
  try {
    const seed = JSON.parse(readFileSync(join(w.dir, '.seed.json'), 'utf8'));
    if (typeof seed?.mcp?.token !== 'string') return {};
    return {
      openpanel: { url: `${w.url('api')}/mcp?token=${seed.mcp.token}` },
    };
  } catch {
    return {};
  }
}

// The one file the hub reads from this repo. Its shape is `hub.config.d.ts` in the hub repo,
// which type-checks this file in its own tests; a field the hub does not know fails there.
export default {
  name: 'openpanel',
  baseBranch: 'rewrite/v2',
  worktreesDir: '.worktrees',
  github: 'Openpanel-dev/openpanel',
  domains: { local: 'local.openpanel.cc', remote: 'openpanel.cc' },
  install:
    'bun install && bun run --filter @openpanel/db codegen && bunx playwright install chromium',

  // port = 21000 + block×100 + offset. Main checkout is block 0.
  processes: {
    // host: label in front of `<name>.<suffix>`; null is the bare `<name>.<suffix>`.
    web: { host: null, offset: 0, cmd: 'bun run --filter start dev', cwd: '.' },
    api: {
      host: 'api',
      offset: 1,
      cmd: 'bun run --filter @openpanel/api dev',
      cwd: '.',
    },
    studio: {
      host: 'studio',
      offset: 2,
      cmd: 'bun run --filter @openpanel/db studio',
      cwd: '.',
    },
  },

  // Injected as process env. Wins over .env because dotenv-cli runs without -o.
  env: (w) => ({
    // The dashboard's SSR runs under the Cloudflare Vite plugin, whose worker only sees wrangler
    // vars and .env.local unless told to take the process env; without this it would SSR
    // against production's API_URL.
    CLOUDFLARE_INCLUDE_PROCESS_ENV: 'true',
    API_PORT: w.port('api'),
    API_HOST: '127.0.0.1', // Bun.serve defaults to 0.0.0.0
    WEB_PORT: w.port('web'),
    STUDIO_PORT: w.port('studio'),
    API_URL: w.url('api'),
    API_URL_SSR: `http://127.0.0.1:${w.port('api')}`,
    DASHBOARD_URL: w.url('web'),
    API_CORS_ORIGINS: w.url('web'),
    CUSTOM_COOKIE_DOMAIN: w.hostSuffix, // <name>.openpanel.cc; unset on localhost
    DATABASE_URL: w.db.postgres,
    DATABASE_URL_DIRECT: w.db.postgres,
    CLICKHOUSE_URL: w.db.clickhouse,
    REDIS_URL: w.db.redis,
    QUEUE_NAMESPACE: w.name,
    // One Redpanda; topics and the consumer group are per worktree, or two apis would consume
    // each other's events. Topics auto-create (docker/redpanda/bootstrap.yaml).
    KAFKA_BROKERS: w.db.kafka,
    KAFKA_CLIENT_ID: `api-${w.name}`,
    KAFKA_EVENTS_TOPIC: `events-${w.name}`,
    KAFKA_EVENTS_DLQ_TOPIC: `events-${w.name}-dlq`,
    KAFKA_CONSUMER_GROUP: `api-${w.name}`,
  }),

  // A worktree name is a DNS label; a database name is an identifier, so hyphens become underscores.
  databases: {
    postgres: {
      shared: 'postgres',
      isolated: (n) => `openpanel_${n.replace(/-/g, '_')}`,
    },
    clickhouse: {
      shared: 'openpanel',
      isolated: (n) => `openpanel_${n.replace(/-/g, '_')}`,
    },
    redis: { index: (block) => block }, // always per worktree
    kafka: { topics: (n) => [`events-${n}`, `events-${n}-dlq`] },
    migrate: 'bun run --filter @openpanel/db migrate:deploy',
    // Presets of packages/seed; each writes .seed.json and prints the logins it created.
    seed: {
      small: 'bun run --filter @openpanel/seed seed -- --size small --reset',
      medium: 'bun run --filter @openpanel/seed seed -- --size medium --reset',
      large: 'bun run --filter @openpanel/seed seed -- --size large --reset',
    },
  },

  checks: {
    typecheck: 'bun run typecheck',
    lint: 'bun run check',
    test: 'bun run test',
  },

  // The containers belong to the main checkout's compose project, whichever worktree asks.
  data: {
    clickhouse: (w) =>
      `docker compose -f ${w.root}/docker-compose.yml exec op-ch clickhouse-client -d ${w.db.clickhouseName}`,
    redis: (w) =>
      `docker compose -f ${w.root}/docker-compose.yml exec op-kv redis-cli -n ${w.db.redisIndex}`,
    postgres: (w) =>
      `docker compose -f ${w.root}/docker-compose.yml exec op-db psql -U postgres ${w.db.postgresName}`,
    // rpk has no REPL: list this worktree's topics, then leave a shell in the container with rpk on PATH.
    kafka: (w) =>
      `docker compose -f ${w.root}/docker-compose.yml exec op-rp sh -c 'rpk topic list; echo; echo "this worktree: ${w.db.kafkaTopics.join(' ')}"; exec sh'`,
  },

  // Every agent the hub launches can drive the dashboard in a real browser (--ignore-https-errors
  // only skips certificate checks for the hub's local CA; cookies and login are unaffected), and
  // talks to this worktree's own OpenPanel MCP once the seed has written its root-client token.
  agents: {
    mcp: (w) => ({
      playwright: {
        command: 'npx',
        args: [
          '-y',
          '@playwright/mcp@latest',
          '--isolated',
          '--ignore-https-errors',
        ],
      },
      ...seededMcp(w),
    }),
  },

  stack: { up: 'docker compose up -d op-db op-kv op-ch op-rp', cwd: '.' },
  auth: process.platform === 'darwin' ? 'off' : 'password',
  issues: { github: true, userjot: true },
};
