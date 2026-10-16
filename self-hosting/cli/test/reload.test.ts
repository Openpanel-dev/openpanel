import { describe, expect, test } from 'bun:test';
import { parseDocument } from 'yaml';
import { envBlockers } from '../src/commands/reload';
import type { Install } from '../src/doctor/types';
import { EnvFile } from '../src/env-file';
import { templates } from '../src/templates';

const VALID_ENV = [
  'KAFKA_BROKERS="op-rp:9092"',
  'KAFKA_EVENTS_TOPIC_PARTITIONS="24"',
  `ENCRYPTION_KEY="${'ab'.repeat(32)}"`,
  'COOKIE_SECRET="secret"',
  'DASHBOARD_URL="https://a.example.com"',
  'API_URL="https://a.example.com/api"',
  'SELF_HOSTED="true"',
].join('\n');

const installWithEnv = (env: string): Install => ({
  compose: parseDocument(templates.compose),
  env: new EnvFile(env),
  caddyfile: null,
  files: new Map(),
  fileKind: () => 'file',
});

describe('envBlockers', () => {
  test('a valid .env has nothing blocking a reload', () => {
    expect(envBlockers(installWithEnv(VALID_ENV))).toEqual([]);
  });

  test('a .env that would stop the api from booting blocks it', () => {
    const broken = VALID_ENV.replace(/^COOKIE_SECRET=.*$/m, '').concat(
      '\nADMIN_USERNAME="admin"'
    );
    const ids = envBlockers(installWithEnv(broken)).map(
      (finding) => finding.id
    );
    expect(ids).toContain('env/cookie-secret');
    expect(ids).toContain('env/admin-credentials');
  });

  test('warnings and compose findings do not block a reload', () => {
    const noSelfHosted = VALID_ENV.replace(/^SELF_HOSTED=.*$/m, '');
    expect(envBlockers(installWithEnv(noSelfHosted))).toEqual([]);
  });
});
