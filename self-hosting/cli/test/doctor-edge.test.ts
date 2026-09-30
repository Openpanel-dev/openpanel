import { afterEach, describe, expect, test } from 'bun:test';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDocument } from 'yaml';
import { applyFixes, runDoctor } from '../src/doctor';
import { loadInstall, writeInstall } from '../src/install';

const V1_FIXTURE = join(import.meta.dir, 'fixtures/v1');
// Owner read/write only, as `ls -l` shows the last three octal digits.
const SECRET_MODE = '600';
// Compose interpolation syntax, spelled so the linter does not read it as a template.
const DOLLAR = '$';
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const v1Copy = () => {
  const dir = mkdtempSync(join(tmpdir(), 'op-edge-'));
  tempDirs.push(dir);
  cpSync(V1_FIXTURE, dir, { recursive: true });
  return dir;
};

const editCompose = (dir: string, edit: (text: string) => string) => {
  const path = join(dir, 'docker-compose.yml');
  writeFileSync(path, edit(readFileSync(path, 'utf8')));
};

const editEnv = (dir: string, edit: (text: string) => string) => {
  const path = join(dir, '.env');
  writeFileSync(path, edit(readFileSync(path, 'utf8')));
};

const ids = (dir: string) =>
  runDoctor(loadInstall(dir)).map((finding) => finding.id);

const fixed = (dir: string) => {
  const install = loadInstall(dir);
  applyFixes(install);
  return install;
};

describe('depends_on shapes', () => {
  test('a list gains op-rp as a list entry', () => {
    const dir = v1Copy();
    editCompose(dir, (text) =>
      text.replace(
        / {2}op-worker:\n(.*\n)*? {4}depends_on:\n {6}op-api:\n {8}condition: service_healthy\n/,
        (block) =>
          block.replace(
            '      op-api:\n        condition: service_healthy\n',
            '      - op-api\n'
          )
      )
    );
    const compose = parseDocument(String(fixed(dir).compose)).toJS();
    expect(compose.services['op-worker'].depends_on).toEqual([
      'op-api',
      'op-rp',
    ]);
  });

  test('an alias shared by two services is copied, not edited in place', () => {
    const dir = mkdtempSync(join(tmpdir(), 'op-edge-'));
    tempDirs.push(dir);
    writeFileSync(
      join(dir, 'docker-compose.yml'),
      [
        'x-deps: &deps',
        '  op-db:',
        '    condition: service_healthy',
        'services:',
        '  op-db: { image: postgres:14-alpine }',
        '  op-api:',
        '    image: lindesvard/openpanel-api:2',
        '    depends_on: *deps',
        '  op-dashboard:',
        '    image: lindesvard/openpanel-dashboard:2',
        '    depends_on: *deps',
        '',
      ].join('\n')
    );
    writeFileSync(join(dir, '.env'), 'KAFKA_BROKERS="op-rp:9092"\n');

    const compose = parseDocument(String(fixed(dir).compose)).toJS();
    expect(Object.keys(compose.services['op-api'].depends_on)).toEqual([
      'op-db',
      'op-rp',
    ]);
    expect(Object.keys(compose.services['op-dashboard'].depends_on)).toEqual([
      'op-db',
    ]);
    expect(Object.keys(compose['x-deps'])).toEqual(['op-db']);
  });
});

describe('external Kafka', () => {
  test('KAFKA_BROKERS pointing elsewhere skips Redpanda and the drain reminder', () => {
    const dir = v1Copy();
    editEnv(dir, (text) => `${text}KAFKA_BROKERS="kafka.internal:9092"\n`);
    editCompose(dir, (text) =>
      text.replace(
        'lindesvard/openpanel-worker:2',
        'lindesvard/openpanel-api:2'
      )
    );

    const found = ids(dir);
    expect(found).not.toContain('compose/redpanda-service');
    expect(found).not.toContain('files/redpanda-bootstrap');
    expect(found).not.toContain('upgrade/drain-old-queue');
  });
});

describe('env renames', () => {
  test('pre-2.0 names are carried over to the new names, then removed', () => {
    const dir = v1Copy();
    editEnv(dir, (text) =>
      text
        .replace(
          /^DASHBOARD_URL=.*\n/m,
          'NEXT_PUBLIC_DASHBOARD_URL="https://old.example.com"\n'
        )
        .replace(
          /^API_URL=.*\n/m,
          'NEXT_PUBLIC_API_URL="https://old.example.com/api"\n'
        )
    );
    const { env } = fixed(dir);
    expect(env.get('DASHBOARD_URL')).toBe('https://old.example.com');
    expect(env.get('API_URL')).toBe('https://old.example.com/api');
    expect(env.has('NEXT_PUBLIC_API_URL')).toBe(false);
  });

  test('a missing API_URL is a manual step that suggests the bundled-Caddy address', () => {
    const dir = v1Copy();
    editEnv(dir, (text) => text.replace(/^API_URL=.*\n/m, ''));
    const finding = runDoctor(loadInstall(dir)).find(
      (item) => item.id === 'env/api-url'
    );
    expect(finding?.fix).toBeUndefined();
    expect(finding?.manual).toContain('https://analytics.example.com/api');
  });
});

describe('files', () => {
  test('a bootstrap.yaml directory (made by docker) is reported, not written over', () => {
    const dir = v1Copy();
    mkdirSync(join(dir, 'redpanda/bootstrap.yaml'), { recursive: true });
    const finding = runDoctor(loadInstall(dir)).find(
      (item) => item.id === 'files/redpanda-bootstrap'
    );
    expect(finding?.title).toContain('is a directory');
    expect(finding?.fix).toBeUndefined();
  });

  test('a second write keeps the first backup and adds a timestamped one', async () => {
    const dir = v1Copy();
    const original = readFileSync(join(dir, '.env'), 'utf8');

    await writeInstall(dir, fixed(dir));
    const once = loadInstall(dir);
    once.env.set('EXTRA', '1');
    await writeInstall(dir, once);

    expect(readFileSync(join(dir, '.env.bak'), 'utf8')).toBe(original);
    const backups = readdirSync(dir).filter((name) =>
      name.startsWith('.env.bak')
    );
    expect(backups.length).toBe(2);
  });

  test('.env and its backups are only readable by the owner', async () => {
    const dir = v1Copy();
    await writeInstall(dir, fixed(dir));
    const mode = (name: string) =>
      statSync(join(dir, name)).mode.toString(8).slice(-3);
    expect(mode('.env')).toBe(SECRET_MODE);
    expect(mode('.env.bak')).toBe(SECRET_MODE);
  });
});

describe('worker replicas', () => {
  test('a literal count becomes an overridable variable with the same default', () => {
    const replicas = fixed(v1Copy()).compose.getIn([
      'services',
      'op-worker',
      'deploy',
      'replicas',
    ]);
    expect(replicas).toBe(`${DOLLAR}{OP_WORKER_REPLICAS:-1}`);
  });
});
