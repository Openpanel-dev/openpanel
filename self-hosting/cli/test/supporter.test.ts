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
  pointAt,
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

const image = (target: Install, service: string) =>
  target.compose.getIn(['services', service, 'image']);

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

describe('channels', () => {
  test('a fresh install is on the public channel', () => {
    expect(channelOf(install())).toBe('public');
  });

  test('switching to supporter points api and worker at the api image, dashboard at its own', () => {
    const target = install();
    const changes = pointAt(target, 'supporter', '3.1.9');

    expect(image(target, 'op-api')).toBe(
      `${SUPPORTER_REGISTRY}/openpanel-dev/api:3.1.9`
    );
    expect(image(target, 'op-worker')).toBe(
      `${SUPPORTER_REGISTRY}/openpanel-dev/api:3.1.9`
    );
    expect(image(target, 'op-dashboard')).toBe(
      `${SUPPORTER_REGISTRY}/openpanel-dev/dashboard:3.1.9`
    );
    expect(changes).toHaveLength(3);
    expect(channelOf(target)).toBe('supporter');
  });

  test('switching back to public restores the Docker Hub images', () => {
    const target = install();
    pointAt(target, 'supporter', '3.1.9');
    pointAt(target, 'public', '3.1.4');
    expect(image(target, 'op-api')).toBe('lindesvard/openpanel-api:3.1.4');
    expect(image(target, 'op-dashboard')).toBe(
      'lindesvard/openpanel-dashboard:3.1.4'
    );
    expect(channelOf(target)).toBe('public');
  });

  test('nothing changes when the images are already right', () => {
    const target = install();
    pointAt(target, 'supporter', '3.1.9');
    expect(pointAt(target, 'supporter', '3.1.9')).toEqual([]);
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
