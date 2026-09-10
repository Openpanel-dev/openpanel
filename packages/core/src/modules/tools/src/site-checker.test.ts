// Route-handler coverage for runSiteCheck — the smell docs/review/tools.md
// (M14-133) flagged as "zero test coverage of the two route handlers." Only
// the pre-fetch guards (missing/invalid URL, SSRF rejection, rate limit) are
// covered here: they run with no outbound I/O. The full probe (fetch, TLS,
// robots.txt, hosting lookup) is 700 lines of live network calls and is left
// uncovered — exercising it would mean mocking most of the file's behaviour,
// which risks diverging from what it actually does more than it protects.

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
