import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { decide } from './next-version';
import { readCommits } from './release-notes';

// A git hook (pre-push runs this suite) exports GIT_DIR and friends, which win
// over `cwd`: this suite once committed, tagged and set user/core.bare on the
// real repository. Every git call here, and in the code under test, is pinned
// to the scratch repository instead.
for (const key of Object.keys(process.env)) {
  if (key.startsWith('GIT_')) {
    delete process.env[key];
  }
}

const repo = mkdtempSync(join(tmpdir(), 'op-release-'));
if (!repo.startsWith(tmpdir())) {
  throw new Error(`refusing to run git outside the temp dir: ${repo}`);
}
process.env.GIT_DIR = join(repo, '.git');
process.env.GIT_WORK_TREE = repo;
process.env.GIT_CONFIG_NOSYSTEM = '1';
process.env.GIT_CONFIG_GLOBAL = '/dev/null';

const run = (...args: string[]) =>
  execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
const PRODUCT_FILE = 'packages/core/src/index.ts';
const PUBLIC_FILE = 'apps/public/content/page.mdx';

const commit = (message: string, paths: string[] = [PRODUCT_FILE]) => {
  for (const path of paths) {
    const file = join(repo, path);
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${message}\n`);
  }
  run('add', '-A');
  run('commit', '-q', '-m', message);
  return run('rev-parse', 'HEAD');
};
const originalCwd = process.cwd();

beforeAll(() => {
  run('init', '-q', '-b', 'main');
  run('config', 'user.email', 'test@example.com');
  run('config', 'user.name', 'test');
  process.chdir(repo);
});

afterAll(() => {
  process.chdir(originalCwd);
  rmSync(repo, { recursive: true, force: true });
});

describe('decide', () => {
  test('from the v2.3.0 baseline, the first push is v3.0.0', () => {
    run('tag', 'v2.3.0', commit('v2 era'));
    const head = commit('self-hosting: the openpanel CLI');
    expect(decide(head)).toEqual({
      kind: 'new',
      version: '3.0.0',
      previous: '2.3.0',
      bump: 'patch',
    });
    run('tag', 'v3.0.0', head);
  });

  test('a feat since the last tag is a minor bump', () => {
    commit('fix: small thing');
    const head = commit('feat(api): new endpoint');
    expect(decide(head)).toMatchObject({
      kind: 'new',
      version: '3.1.0',
      bump: 'minor',
    });
    run('tag', 'v3.1.0', head);
  });

  test('rerunning an already-tagged commit keeps its version', () => {
    expect(decide(run('rev-parse', 'HEAD'))).toEqual({
      kind: 'existing',
      version: '3.1.0',
    });
  });

  test('a run for an older commit that finishes after a newer release is skipped', () => {
    const older = commit('fix: older push');
    const newer = commit('fix: newer push');
    run('tag', 'v3.1.1', newer);
    expect(decide(older)).toEqual({ kind: 'superseded', by: '3.1.1' });
  });

  test('a feat followed by a fix is still a minor bump', () => {
    commit('feat(api): earlier feature');
    const head = commit('fix(api): later fix');
    expect(decide(head)).toMatchObject({
      kind: 'new',
      version: '3.2.0',
      bump: 'minor',
    });
    run('tag', 'v3.2.0', head);
  });

  test('a feat that only touches the marketing site does not bump the version', () => {
    commit('feat(public): new compare page', [PUBLIC_FILE]);
    const head = commit('fix(api): small thing');
    expect(decide(head)).toMatchObject({
      kind: 'new',
      version: '3.2.1',
      bump: 'patch',
    });
    run('tag', 'v3.2.1', head);
  });

  test('a feat that also changes product code still counts', () => {
    const head = commit('feat: dashboard and docs together', [
      PRODUCT_FILE,
      PUBLIC_FILE,
    ]);
    expect(decide(head)).toMatchObject({
      kind: 'new',
      version: '3.3.0',
      bump: 'minor',
    });
    run('tag', 'v3.3.0', head);
  });
});

describe('readCommits', () => {
  test('leaves out commits that only touch the marketing site', () => {
    commit('chore(public): rewrite an article', [PUBLIC_FILE]);
    commit('fix(api): keep this one');
    const subjects = readCommits('v3.3.0', 'HEAD').map(
      (entry) => entry.subject
    );
    expect(subjects).toEqual(['fix(api): keep this one']);
  });
});
