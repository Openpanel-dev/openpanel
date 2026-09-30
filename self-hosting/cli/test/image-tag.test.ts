import { describe, expect, test } from 'bun:test';
import { parseDocument } from 'yaml';
import { applyFixes, runDoctor } from '../src/doctor';
import { satisfiesStack } from '../src/doctor/checks';
import type { Install } from '../src/doctor/types';
import { EnvFile } from '../src/env-file';
import { STACK_IMAGE_TAG, templates } from '../src/templates';

// A current install whose image lines are replaced, so only the tag check can fire.
const installWithImages = (images: Record<string, string>): Install => {
  const compose = parseDocument(templates.compose);
  for (const [service, image] of Object.entries(images)) {
    compose.setIn(['services', service, 'image'], image);
  }
  const env = new EnvFile(
    [
      'SELF_HOSTED="true"',
      'DASHBOARD_URL="https://a.example.com"',
      'KAFKA_BROKERS="op-rp:9092"',
      'KAFKA_EVENTS_TOPIC_PARTITIONS="24"',
      `ENCRYPTION_KEY="${'ab'.repeat(32)}"`,
      'COOKIE_SECRET="secret"',
    ].join('\n')
  );
  return {
    compose,
    env,
    caddyfile: null,
    files: new Map(),
    fileKind: () => 'file',
  };
};

const tagFinding = (install: Install) =>
  runDoctor(install).find((finding) => finding.id === 'compose/image-tag');

describe('compose/image-tag', () => {
  test('the expected tag is read from the template', () => {
    expect(STACK_IMAGE_TAG).toMatch(/^[\w.-]+$/);
    expect(
      String(
        parseDocument(templates.compose).getIn(['services', 'op-api', 'image'])
      )
    ).toEndWith(`:${STACK_IMAGE_TAG}`);
  });

  test('an install already on the expected tag is left alone', () => {
    expect(tagFinding(installWithImages({}))).toBeUndefined();
  });

  test('floating tags from an older line are rewritten', () => {
    const install = installWithImages({
      'op-api': 'lindesvard/openpanel-api:1',
      'op-dashboard': 'lindesvard/openpanel-dashboard:latest',
    });
    expect(tagFinding(install)?.fix).toBeDefined();

    applyFixes(install);
    const compose = install.compose.toJS();
    expect(compose.services['op-api'].image).toBe(
      `lindesvard/openpanel-api:${STACK_IMAGE_TAG}`
    );
    expect(compose.services['op-dashboard'].image).toBe(
      `lindesvard/openpanel-dashboard:${STACK_IMAGE_TAG}`
    );
    expect(tagFinding(install)).toBeUndefined();
  });

  test('exact pins are moved too, and the title says what changes', () => {
    const install = installWithImages({
      'op-api': 'lindesvard/openpanel-api:1.2.3',
      'op-dashboard': 'lindesvard/openpanel-dashboard:1',
    });
    expect(tagFinding(install)?.title).toContain(
      `op-api 1.2.3 → ${STACK_IMAGE_TAG}`
    );

    applyFixes(install);
    const compose = install.compose.toJS();
    expect(compose.services['op-api'].image).toBe(
      `lindesvard/openpanel-api:${STACK_IMAGE_TAG}`
    );
    expect(compose.services['op-dashboard'].image).toBe(
      `lindesvard/openpanel-dashboard:${STACK_IMAGE_TAG}`
    );
  });

  test('supporter and third-party registries are never touched', () => {
    const supporter = 'docker.openpanel.dev/openpanel-dev/api:main-ab12';
    const install = installWithImages({
      'op-api': supporter,
      'op-db': 'postgres:14-alpine',
    });

    expect(tagFinding(install)).toBeUndefined();
    applyFixes(install);
    expect(install.compose.getIn(['services', 'op-api', 'image'])).toBe(
      supporter
    );
  });
});

describe('satisfiesStack', () => {
  test('a release CLI moves floating and older tags to its exact version', () => {
    expect(satisfiesStack('3', '3.1.4')).toBe(false);
    expect(satisfiesStack('latest', '3.1.4')).toBe(false);
    expect(satisfiesStack('3.1.3', '3.1.4')).toBe(false);
    expect(satisfiesStack('2.3.0', '3.1.4')).toBe(false);
  });

  test('a release CLI never downgrades newer images', () => {
    expect(satisfiesStack('3.1.4', '3.1.4')).toBe(true);
    expect(satisfiesStack('3.2.0', '3.1.4')).toBe(true);
  });

  test('a dev build (floating major) accepts any exact version of that major', () => {
    expect(satisfiesStack('3.1.4', '3')).toBe(true);
    expect(satisfiesStack('3', '3')).toBe(true);
    expect(satisfiesStack('2', '3')).toBe(false);
    expect(satisfiesStack('2.3.0', '3')).toBe(false);
  });
});
