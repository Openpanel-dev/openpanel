import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDocument } from 'yaml';
import type { Install } from '../src/doctor/types';
import { EnvFile } from '../src/env-file';
import type { Fetcher } from '../src/self-update';
import {
  channelOf,
  isLoggedIn,
  latestBuildVersion,
  SUPPORTER_REGISTRY,
} from '../src/supporter';
import { templates } from '../src/templates';

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const install = (): Install => ({
  compose: parseDocument(templates.compose),
  env: new EnvFile(''),
  caddyfile: null,
  files: new Map(),
  fileKind: () => 'file',
});

const tagsFeed =
  (names: string[], ok = true): Fetcher =>
  async () =>
    ok
      ? Response.json(names.map((name) => ({ name })))
      : new Response('rate limited', { status: 403 });

const dockerConfig = (config: unknown) => {
  const dir = mkdtempSync(join(tmpdir(), 'op-docker-'));
  tempDirs.push(dir);
  writeFileSync(join(dir, 'config.json'), JSON.stringify(config));
  return dir;
};

describe('channelOf', () => {
  test('an install on docker.openpanel.dev images is on the supporter channel', () => {
    const target = install();
    expect(channelOf(target)).toBe('public');
    target.compose.setIn(
      ['services', 'op-api', 'image'],
      `${SUPPORTER_REGISTRY}/openpanel-dev/api:3.1.9`
    );
    expect(channelOf(target)).toBe('supporter');
  });
});

describe('latestBuildVersion', () => {
  test('picks the highest version numerically, ignoring other tags', async () => {
    const feed = tagsFeed([
      'self-hosting',
      'v3.1.10',
      'v3.1.9',
      'v3.2.0-rc',
      'api',
      'v2.3.0',
    ]);
    expect(await latestBuildVersion(feed)).toBe('3.1.10');
  });

  test('fails clearly without versions or without access', async () => {
    await expect(
      latestBuildVersion(tagsFeed(['self-hosting']))
    ).rejects.toThrow('No versioned builds');
    await expect(latestBuildVersion(tagsFeed([], false))).rejects.toThrow(
      'HTTP 403'
    );
  });
});

describe('isLoggedIn', () => {
  test.each([
    ['auths', { auths: { 'docker.openpanel.dev': {} } }],
    [
      'auths with a URL key',
      { auths: { 'https://docker.openpanel.dev/v1/': {} } },
    ],
    [
      'a credential helper',
      { credHelpers: { 'docker.openpanel.dev': 'desktop' } },
    ],
  ])('recognises %s', (_label, config) => {
    expect(isLoggedIn(SUPPORTER_REGISTRY, dockerConfig(config))).toBe(true);
  });

  test('other registries or no config mean not logged in', () => {
    expect(
      isLoggedIn(SUPPORTER_REGISTRY, dockerConfig({ auths: { 'ghcr.io': {} } }))
    ).toBe(false);
    expect(
      isLoggedIn(SUPPORTER_REGISTRY, join(tmpdir(), 'no-such-docker-config'))
    ).toBe(false);
  });
});
