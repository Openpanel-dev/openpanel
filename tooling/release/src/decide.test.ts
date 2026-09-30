import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decide } from './next-version';

const repo = mkdtempSync(join(tmpdir(), 'op-release-'));
const run = (...args: string[]) =>
  execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
const commit = (message: string) => {
  run('commit', '--allow-empty', '-q', '-m', message);
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
});
