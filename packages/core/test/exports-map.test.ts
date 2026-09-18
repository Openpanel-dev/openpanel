import { expect, test } from 'bun:test';

// The exports map is the only structural barrier between apps/start and a
// service (ADR-008). Widening it is silent, so it is asserted here.
test('the curated barrel resolves', async () => {
  expect(await import('@openpanel/core')).toBeDefined();
});

test('a non-exported internal path does not resolve', async () => {
  // @ts-expect-error not in the exports map, by design
  const attempt = import('@openpanel/core/context');
  await expect(attempt).rejects.toThrow(/Cannot find/);
});

test('preload pins infrastructure at local addresses', () => {
  expect(process.env.CLICKHOUSE_URL).toBe(
    'http://localhost:23123/openpanel_test'
  );
  expect(process.env.SELF_HOSTED).toBe('true');
});
