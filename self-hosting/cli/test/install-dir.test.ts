import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EnvFile } from '../src/env-file';
import { generateSecrets } from '../src/init/generate';
import { isInstallDir } from '../src/install';
import { resolveInstallDir } from '../src/install-dir';
import { templates } from '../src/templates';

// The repo's own dev compose: same service prefix, but no app services.
const DEV_COMPOSE =
  'services:\n  op-db: { image: postgres }\n  op-ch: { image: clickhouse }\n  op-rp: { image: redpanda }\n';

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const root = () => {
  const dir = mkdtempSync(join(tmpdir(), 'op-dir-'));
  tempDirs.push(dir);
  return dir;
};

const withCompose = (dir: string, compose: string) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'docker-compose.yml'), compose);
  return dir;
};

const install = (dir: string) => withCompose(dir, templates.compose);

const resolve = (
  inputs: Partial<Parameters<typeof resolveInstallDir>[0]> & { cwd: string }
) =>
  resolveInstallDir({
    remembered: null,
    runningDirs: [],
    knownPaths: [],
    ...inputs,
  });

describe('isInstallDir', () => {
  test('needs op-api and op-dashboard, not just any compose file', () => {
    const base = root();
    expect(isInstallDir(install(join(base, 'real')))).toBe(true);
    expect(isInstallDir(withCompose(join(base, 'dev'), DEV_COMPOSE))).toBe(
      false
    );
    expect(
      isInstallDir(
        withCompose(join(base, 'web'), 'services:\n  web: { image: nginx }\n')
      )
    ).toBe(false);
    expect(
      isInstallDir(withCompose(join(base, 'broken'), 'services: [unclosed'))
    ).toBe(false);
    expect(isInstallDir(join(base, 'missing'))).toBe(false);
  });
});

describe('resolveInstallDir', () => {
  test('an explicit --dir wins, even before it exists', () => {
    const base = root();
    install(join(base, 'cwd'));
    expect(
      resolve({ flag: join(base, 'new'), cwd: join(base, 'cwd') })
    ).toEqual({
      kind: 'found',
      dir: join(base, 'new'),
      source: '--dir',
    });
  });

  test('the current directory when it is an install', () => {
    const cwd = install(join(root(), 'here'));
    expect(resolve({ cwd })).toMatchObject({
      kind: 'found',
      dir: cwd,
      source: 'current directory',
    });
  });

  test('an old git clone: the repo root is skipped in favour of ./self-hosting', () => {
    const clone = withCompose(join(root(), 'openpanel'), DEV_COMPOSE);
    install(join(clone, 'self-hosting'));
    expect(resolve({ cwd: clone })).toMatchObject({
      kind: 'found',
      dir: join(clone, 'self-hosting'),
      source: './self-hosting',
    });
  });

  test('from anywhere: a remembered install is used while it still exists', () => {
    const base = root();
    const remembered = install(join(base, 'remembered'));
    expect(resolve({ cwd: base, remembered })).toMatchObject({
      dir: remembered,
      source: 'remembered',
    });
    rmSync(remembered, { recursive: true });
    expect(resolve({ cwd: base, remembered }).kind).toBe('none');
  });

  test('from anywhere: a single running OpenPanel stack is found, other projects ignored', () => {
    const base = root();
    const stack = install(join(base, 'stack'));
    const other = withCompose(
      join(base, 'other'),
      'services:\n  web: { image: nginx }\n'
    );
    expect(
      resolve({ cwd: base, runningDirs: [other, stack, stack] })
    ).toMatchObject({
      dir: stack,
      source: 'running stack',
    });
  });

  test('several candidates are listed instead of guessed', () => {
    const base = root();
    const one = install(join(base, 'one'));
    const two = install(join(base, 'two'));
    expect(
      resolve({ cwd: base, runningDirs: [one], knownPaths: [two] })
    ).toEqual({
      kind: 'ambiguous',
      candidates: [one, two],
    });
  });

  test('nothing found reports where it looked', () => {
    const base = root();
    const result = resolve({ cwd: base, knownPaths: [join(base, 'opt')] });
    expect(result).toEqual({
      kind: 'none',
      searched: [base, join(base, 'self-hosting'), join(base, 'opt')],
    });
  });
});

describe('generateSecrets', () => {
  test('keeps values from an existing .env and only fills the gaps', () => {
    const existing = new EnvFile(
      `ENCRYPTION_KEY="${'ab'.repeat(32)}"\nCOOKIE_SECRET="keep-me"\n`
    );
    const secrets = generateSecrets(existing);
    expect(secrets.encryptionKey).toBe('ab'.repeat(32));
    expect(secrets.cookieSecret).toBe('keep-me');
    expect(secrets.adminPassword).toMatch(/^[0-9a-f]{24}$/);
  });
});
