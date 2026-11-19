import { expect, test } from 'bun:test';
import {
  MAX_IMPORT_RANGE_DAYS,
  zAmplitudeImportConfig,
  zMixpanelImportConfig,
} from './import.constants';

const mixpanel = {
  provider: 'mixpanel',
  type: 'api',
  serviceAccount: 'account',
  serviceSecret: 'secret',
  projectId: '123',
} as const;

const amplitude = {
  provider: 'amplitude',
  type: 'api',
  apiKey: 'key',
  secretKey: 'secret',
} as const;

test('an API import accepts a single day and an ordinary range', () => {
  for (const range of [
    { from: '2025-01-01', to: '2025-01-01' },
    { from: '2024-01-01', to: '2025-01-01' },
  ]) {
    expect(
      zMixpanelImportConfig.safeParse({ ...mixpanel, ...range }).success
    ).toBe(true);
    expect(
      zAmplitudeImportConfig.safeParse({ ...amplitude, ...range }).success
    ).toBe(true);
  }
});

test('an API import rejects a non-date, a reversed range and an oversized span', () => {
  const longestTo = new Date(Date.UTC(2000, 0, MAX_IMPORT_RANGE_DAYS + 1))
    .toISOString()
    .slice(0, 10);
  for (const range of [
    { from: 'yesterday', to: '2025-01-01' },
    { from: '2025-01-02', to: '2025-01-01' },
    { from: '0001-01-01', to: '9999-12-31' },
    { from: '2000-01-01', to: longestTo },
  ]) {
    expect(
      zMixpanelImportConfig.safeParse({ ...mixpanel, ...range }).success
    ).toBe(false);
    expect(
      zAmplitudeImportConfig.safeParse({ ...amplitude, ...range }).success
    ).toBe(false);
  }
});
