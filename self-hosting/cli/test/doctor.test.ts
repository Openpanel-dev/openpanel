import { afterEach, describe, expect, test } from 'bun:test';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDocument } from 'yaml';
import { applyFixes, runDoctor } from '../src/doctor';
import { loadInstall, writeInstall } from '../src/install';

const V1_FIXTURE = join(import.meta.dir, 'fixtures/v1');
const tempDirs: string[] = [];

const copyFixture = () => {
  const dir = mkdtempSync(join(tmpdir(), 'op-doctor-'));
  tempDirs.push(dir);
  cpSync(V1_FIXTURE, dir, { recursive: true });
  return dir;
};

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('doctor on a v1 install', () => {
  test('reports every breaking change', () => {
    const ids = runDoctor(loadInstall(V1_FIXTURE)).map((finding) => finding.id);
    expect(ids).toEqual([
      'upgrade/drain-old-queue',
      'compose/redpanda-service',
      'files/redpanda-bootstrap',
      'compose/worker-image',
      'compose/worker-role',
      'compose/worker-healthcheck',
      'compose/api-migrations',
      'env/kafka-brokers',
      'env/kafka-partitions',
      'env/enabled-queues',
      'env/removed-vars',
      'caddy/bullboard-redirect',
    ]);
  });

  test('fixes leave nothing fixable behind', () => {
    const install = loadInstall(V1_FIXTURE);
    applyFixes(install);
    const remaining = runDoctor(install).filter((finding) => finding.fix);
    expect(remaining).toEqual([]);
  });

  test('the repaired compose file matches the v3 shape', () => {
    const install = loadInstall(V1_FIXTURE);
    applyFixes(install);
    const compose = parseDocument(String(install.compose)).toJS();

    expect(compose.services['op-rp'].image).toContain('redpanda');
    expect(compose.volumes).toHaveProperty('op-rp-data');
    expect(compose.services['op-worker'].image).toBe(
      compose.services['op-api'].image
    );
    expect(compose.services['op-worker'].environment).toContain('ROLE=worker');
    expect(compose.services['op-api'].command).toContain(
      'scripts/migrate-code.ts'
    );
    expect(compose.services['op-api'].depends_on).toHaveProperty('op-rp');
    expect(compose.services['op-worker'].depends_on).toHaveProperty('op-rp');
    expect(JSON.stringify(compose.services['op-worker'].healthcheck)).toContain(
      '/healthz/ready'
    );
  });

  test('env keeps user values and only touches what is stale', () => {
    const install = loadInstall(V1_FIXTURE);
    applyFixes(install);
    const { env } = install;

    expect(env.get('ENCRYPTION_KEY')).toBe('0123456789abcdef'.repeat(4));
    expect(env.get('COOKIE_SECRET')).toBe('0123456789abcdef'.repeat(2));
    expect(env.get('KAFKA_BROKERS')).toBe('op-rp:9092');
    expect(env.get('ENABLED_QUEUES')).toBe('events,sessions,cron');
    expect(env.has('WORKER_PORT')).toBe(false);
    expect(env.has('EVENT_JOB_CONCURRENCY')).toBe(false);
  });

  test('the worker block in the Caddyfile gains the bullboard redirect', () => {
    const install = loadInstall(V1_FIXTURE);
    applyFixes(install);
    expect(install.caddyfile).toContain('redir / /bullboard/');
    expect(install.caddyfile).toContain('reverse_proxy op-worker:3000');
  });

  test('writing backs up originals and is idempotent', async () => {
    const dir = copyFixture();
    const before = readFileSync(join(dir, 'docker-compose.yml'), 'utf8');

    const install = loadInstall(dir);
    applyFixes(install);
    const written = await writeInstall(dir, install);

    expect(written).toContain('docker-compose.yml');
    expect(written).toContain('redpanda/bootstrap.yaml');
    expect(readFileSync(join(dir, 'docker-compose.yml.bak'), 'utf8')).toBe(
      before
    );
    expect(
      readFileSync(join(dir, 'redpanda/bootstrap.yaml'), 'utf8')
    ).toContain('default_topic_partitions: 24');

    const second = loadInstall(dir);
    expect(runDoctor(second).filter((finding) => finding.fix)).toEqual([]);
    expect(await writeInstall(dir, second)).toEqual([]);
  });
});
