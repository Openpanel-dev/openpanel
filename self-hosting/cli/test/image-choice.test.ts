import { describe, expect, test } from 'bun:test';
import { parseDocument } from 'yaml';
import type { Install } from '../src/doctor/types';
import { EnvFile } from '../src/env-file';
import {
  applyImage,
  chooseImage,
  defaultImage,
  imageDecisions,
} from '../src/image-choice';
import { templates } from '../src/templates';

const install = (images: Record<string, string> = {}): Install => {
  const compose = parseDocument(templates.compose);
  for (const [service, image] of Object.entries(images)) {
    compose.setIn(['services', service, 'image'], image);
  }
  return {
    compose,
    env: new EnvFile(''),
    caddyfile: null,
    files: new Map(),
    fileKind: () => 'file',
  };
};

const GHCR_API = 'ghcr.io/openpanel-dev/api:rewrite-v2-9db2';
const GHCR_DASHBOARD = 'ghcr.io/openpanel-dev/dashboard:rewrite-v2-9db2';

describe('imageDecisions', () => {
  test('one decision for api + worker, one for the dashboard', () => {
    const decisions = imageDecisions(install(), 'public', '3.1.4');
    expect(decisions).toEqual([
      {
        services: ['op-api', 'op-worker'],
        current: 'lindesvard/openpanel-api:3',
        proposed: 'lindesvard/openpanel-api:3.1.4',
      },
      {
        services: ['op-dashboard'],
        current: 'lindesvard/openpanel-dashboard:3',
        proposed: 'lindesvard/openpanel-dashboard:3.1.4',
      },
    ]);
  });

  test('the supporter channel proposes the build from docker.openpanel.dev', () => {
    const [api] = imageDecisions(install(), 'supporter', '3.1.9');
    expect(api?.proposed).toBe('docker.openpanel.dev/openpanel-dev/api:3.1.9');
  });

  test('nothing to decide when the images are already the proposed ones', () => {
    const target = install({
      'op-api': 'lindesvard/openpanel-api:3.1.4',
      'op-worker': 'lindesvard/openpanel-api:3.1.4',
      'op-dashboard': 'lindesvard/openpanel-dashboard:3.1.4',
    });
    expect(imageDecisions(target, 'public', '3.1.4')).toEqual([]);
  });
});

describe('without anyone to ask (--yes)', () => {
  test("OpenPanel's own images move to the new version", async () => {
    const [api] = imageDecisions(install(), 'public', '3.1.4');
    expect(await chooseImage(api!, true)).toBe(
      'lindesvard/openpanel-api:3.1.4'
    );
  });

  test('an image from another registry is kept', async () => {
    const target = install({
      'op-api': GHCR_API,
      'op-worker': GHCR_API,
      'op-dashboard': GHCR_DASHBOARD,
    });
    const decisions = imageDecisions(target, 'public', '3.1.4');
    expect(decisions.map(defaultImage)).toEqual([GHCR_API, GHCR_DASHBOARD]);
    for (const decision of decisions) {
      expect(
        applyImage(target, decision, await chooseImage(decision, true))
      ).toEqual([]);
    }
  });
});

describe('applyImage', () => {
  test('sets every service in the decision and reports the changes', () => {
    const target = install();
    const [api] = imageDecisions(target, 'public', '3.1.4');
    const changes = applyImage(
      target,
      api!,
      'registry.example.com/openpanel-api:custom'
    );
    expect(changes).toEqual([
      'op-api: lindesvard/openpanel-api:3 → registry.example.com/openpanel-api:custom',
      'op-worker: lindesvard/openpanel-api:3 → registry.example.com/openpanel-api:custom',
    ]);
    expect(target.compose.getIn(['services', 'op-worker', 'image'])).toBe(
      'registry.example.com/openpanel-api:custom'
    );
  });
});
