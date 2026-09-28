// Route-handler coverage for runIpLookup — the smell docs/review/tools.md
// flagged as "zero test coverage of the two route handlers." getGeoLocation is
// mocked; everything else (validation, rate limiting, private-range
// classification) runs for real.

import { beforeAll, describe, expect, it, mock } from 'bun:test';
import { testCoreConfig } from '../../../../test/config-fixture';

const GEO = {
  city: 'Stockholm',
  country: 'SE',
  region: 'Stockholm County',
  latitude: 59.33,
  longitude: 18.07,
};

const getGeoLocation = mock((_ip?: string) => Promise.resolve(GEO));
mock.module('../../../clients/geo', () => ({ getGeoLocation }));

let runIpLookup: typeof import('./ip-lookup').runIpLookup;
beforeAll(async () => {
  ({ runIpLookup } = await import('./ip-lookup'));
});

const config = testCoreConfig();

describe('runIpLookup', () => {
  it('rejects when no IP is provided or detectable', async () => {
    const outcome = await runIpLookup(config, undefined, {});
    expect(outcome.status).toBe(400);
  });

  it('rejects a malformed IP', async () => {
    const outcome = await runIpLookup(config, 'not-an-ip', {});
    expect(outcome.status).toBe(400);
  });

  it('resolves a valid IPv4 address via the geo client', async () => {
    getGeoLocation.mockClear();
    const outcome = await runIpLookup(config, '8.8.8.8', {});
    expect(outcome.status).toBe(200);
    if (outcome.status === 200) {
      expect(outcome.result.ip).toBe('8.8.8.8');
      expect(outcome.result.location.city).toBe(GEO.city);
      expect(outcome.result.isPrivate).toBe(false);
    }
    expect(getGeoLocation).toHaveBeenCalledTimes(1);
  });

  it('flags a private address without treating it as localhost', async () => {
    const outcome = await runIpLookup(config, '10.0.0.5', {});
    expect(outcome.status).toBe(200);
    if (outcome.status === 200) {
      expect(outcome.result.isPrivate).toBe(true);
      expect(outcome.result.isLocalhost).toBe(false);
    }
  });

  it('enforces the per-caller rate limit', async () => {
    const headers = { 'x-forwarded-for': '203.0.113.9' };
    let lastOutcome: Awaited<ReturnType<typeof runIpLookup>> | undefined;
    for (let i = 0; i < 21; i++) {
      lastOutcome = await runIpLookup(config, '8.8.8.8', headers);
    }
    expect(lastOutcome?.status).toBe(429);
  });
});
