import { describe, expect, test } from 'bun:test';
import { password } from 'bun';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDocument } from 'yaml';
import { runDoctor } from '../src/doctor';
import {
  BUNDLED_URLS,
  defaultAnswers,
  generateInstall,
  generateSecrets,
} from '../src/init/generate';
import { loadInstall, writeFiles } from '../src/install';

const DOMAIN = 'https://analytics.example.com';
const secrets = generateSecrets();

const generate = async (
  overrides: Partial<ReturnType<typeof defaultAnswers>> = {}
) => generateInstall({ ...defaultAnswers(DOMAIN), ...overrides }, secrets);

const composeOf = (files: Map<string, string>) =>
  parseDocument(files.get('docker-compose.yml') as string).toJS();

describe('init output', () => {
  test('a fresh install has nothing for doctor to report', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'op-init-'));
    try {
      await writeFiles(dir, await generate());
      expect(runDoctor(loadInstall(dir))).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('bundled defaults wire every service and write the clickhouse files', async () => {
    const files = await generate();
    const compose = composeOf(files);

    expect(Object.keys(compose.services).sort()).toEqual([
      'op-api',
      'op-ch',
      'op-dashboard',
      'op-db',
      'op-kv',
      'op-proxy',
      'op-rp',
      'op-worker',
    ]);
    expect(files.get('.env')).toContain(
      `CLICKHOUSE_URL="${BUNDLED_URLS.clickhouse}"`
    );
    expect(files.has('clickhouse/init-db.sh')).toBe(true);
    expect(files.has('caddy/Caddyfile')).toBe(true);
  });

  test('an external database removes its service, dependency and volume', async () => {
    const url = 'postgresql://u:p@db.internal:5432/op';
    const files = await generate({ external: { postgres: url } });
    const compose = composeOf(files);

    expect(compose.services).not.toHaveProperty('op-db');
    expect(compose.services['op-api'].depends_on).not.toHaveProperty('op-db');
    expect(compose.volumes).not.toHaveProperty('op-db-data');
    expect(files.get('.env')).toContain(`DATABASE_URL="${url}"`);
    expect(files.get('.env')).toContain(`DATABASE_URL_DIRECT="${url}"`);
  });

  test('an external clickhouse skips its config files', async () => {
    const files = await generate({
      external: { clickhouse: 'http://ch.internal:8123/op' },
    });
    expect(files.has('clickhouse/init-db.sh')).toBe(false);
    expect(composeOf(files).services).not.toHaveProperty('op-ch');
  });

  test('bringing your own proxy drops caddy entirely', async () => {
    const files = await generate({ proxy: 'external' });
    const compose = composeOf(files);

    expect(compose.services).not.toHaveProperty('op-proxy');
    expect(compose.services['op-api'].depends_on).toBeDefined();
    expect(compose.volumes).not.toHaveProperty('op-proxy-data');
    expect(files.has('caddy/Caddyfile')).toBe(false);
  });

  test('worker count is an overridable compose variable', async () => {
    const compose = composeOf(await generate({ workers: 3 }));
    expect(compose.services['op-worker'].deploy.replicas).toBe(
      '${OP_WORKER_REPLICAS:-3}'
    );
  });

  test('the caddy hash verifies against the admin password', async () => {
    const caddyfile = (await generate()).get('caddy/Caddyfile') as string;
    const hash = /admin (\$2b\$\S+)/.exec(caddyfile)?.[1] as string;
    expect(await password.verify(secrets.adminPassword, hash)).toBe(true);
  });

  test('empty optional values are dropped, set ones written', async () => {
    const bare = (await generate()).get('.env') as string;
    expect(bare).not.toContain('RESEND_API_KEY');
    expect(bare).not.toContain('=""');

    const withEmail = (
      await generate({ resendApiKey: 're_123', emailSender: 'hi@example.com' })
    ).get('.env') as string;
    expect(withEmail).toContain('RESEND_API_KEY="re_123"');
    expect(withEmail).toContain('EMAIL_SENDER="hi@example.com"');
  });

  test('the partition count reaches both .env and the redpanda bootstrap', async () => {
    const files = await generate({ partitions: 12 });
    expect(files.get('.env')).toContain('KAFKA_EVENTS_TOPIC_PARTITIONS="12"');
    expect(files.get('redpanda/bootstrap.yaml')).toContain(
      'default_topic_partitions: 12'
    );
  });
});
