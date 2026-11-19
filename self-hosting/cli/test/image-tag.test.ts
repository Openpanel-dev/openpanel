import { describe, expect, test } from 'bun:test';
import { parseDocument } from 'yaml';
import { imageTagFor, satisfiesStack } from '../src/doctor/checks';
import type { Install } from '../src/doctor/types';
import { EnvFile } from '../src/env-file';
import { STACK_IMAGE_TAG, templates } from '../src/templates';

const RELEASE = '3.1.4';
const check = imageTagFor(RELEASE);

const installWithImages = (images: Record<string, string>): Install => {
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

const image = (install: Install, service: string) =>
  install.compose.getIn(['services', service, 'image']);

describe('compose/image-tag for a release CLI', () => {
  test('floating and older tags move to the exact version', () => {
    const install = installWithImages({
      'op-api': 'lindesvard/openpanel-api:3',
      'op-dashboard': 'lindesvard/openpanel-dashboard:latest',
      'op-worker': 'lindesvard/openpanel-api:3.0.0',
    });
    const finding = check(install);
    expect(finding?.title).toContain('op-api 3 → 3.1.4');

    finding?.fix?.(install);
    expect(image(install, 'op-api')).toBe(
      `lindesvard/openpanel-api:${RELEASE}`
    );
    expect(image(install, 'op-dashboard')).toBe(
      `lindesvard/openpanel-dashboard:${RELEASE}`
    );
    expect(image(install, 'op-worker')).toBe(
      `lindesvard/openpanel-api:${RELEASE}`
    );
    expect(check(install)).toBeNull();
  });

  test('images already on the version, or newer, are left alone', () => {
    expect(
      check(
        installWithImages({
          'op-api': `lindesvard/openpanel-api:${RELEASE}`,
          'op-dashboard': 'lindesvard/openpanel-dashboard:3.2.0',
          'op-worker': `lindesvard/openpanel-api:${RELEASE}`,
        })
      )
    ).toBeNull();
  });

  test('supporter and third-party registries are never touched', () => {
    const supporter = 'docker.openpanel.dev/openpanel-dev/api:3.1.9';
    const install = installWithImages({
      'op-api': supporter,
      'op-dashboard': `lindesvard/openpanel-dashboard:${RELEASE}`,
      'op-worker': supporter,
    });
    expect(check(install)).toBeNull();
  });
});

describe('a dev build (run from source)', () => {
  test('has no version, so it leaves image tags alone', () => {
    expect(STACK_IMAGE_TAG).toBeNull();
    expect(
      imageTagFor(null)(
        installWithImages({ 'op-api': 'lindesvard/openpanel-api:1' })
      )
    ).toBeNull();
  });
});

describe('satisfiesStack', () => {
  test('older, floating and other tags do not satisfy an exact version', () => {
    expect(satisfiesStack('3', '3.1.4')).toBe(false);
    expect(satisfiesStack('latest', '3.1.4')).toBe(false);
    expect(satisfiesStack('3.1.3', '3.1.4')).toBe(false);
    expect(satisfiesStack('2.3.0', '3.1.4')).toBe(false);
  });

  test('the same or a newer version does (never downgrade)', () => {
    expect(satisfiesStack('3.1.4', '3.1.4')).toBe(true);
    expect(satisfiesStack('3.2.0', '3.1.4')).toBe(true);
  });
});
