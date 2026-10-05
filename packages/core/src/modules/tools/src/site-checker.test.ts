// Only the pre-fetch guards (missing/invalid URL, SSRF rejection, rate limit) are
// covered: they run with no outbound I/O. The full probe is live network calls, and
// mocking most of it would diverge from what it does more than it protects.

import { describe, expect, it } from 'bun:test';
import { testCoreConfig } from '../../../../test/config-fixture';
import { runSiteCheck } from './site-checker';

const config = testCoreConfig();

describe('runSiteCheck', () => {
  it('rejects when no URL is provided', async () => {
    const outcome = await runSiteCheck(config, undefined, {});
    expect(outcome.status).toBe(400);
  });

  it('rejects an unparsable URL', async () => {
    const outcome = await runSiteCheck(config, 'not a url', {});
    expect(outcome.status).toBe(400);
  });

  it('rejects a URL that resolves to a non-public address (SSRF guard)', async () => {
    const outcome = await runSiteCheck(config, 'http://127.0.0.1', {});
    expect(outcome.status).toBe(400);
  });

  it('enforces the per-caller rate limit', async () => {
    const headers = { 'x-forwarded-for': '203.0.113.10' };
    let lastOutcome: Awaited<ReturnType<typeof runSiteCheck>> | undefined;
    for (let i = 0; i < 11; i++) {
      lastOutcome = await runSiteCheck(config, 'http://127.0.0.1', headers);
    }
    expect(lastOutcome?.status).toBe(429);
  });
});
