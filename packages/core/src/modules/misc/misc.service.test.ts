import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { testCoreConfig } from '../../../test/config-fixture';
import { getFavicon } from './misc.service';
import * as providers from './src/favicon-providers';

const ICON = { buffer: Buffer.from('icon'), contentType: 'image/png' };

// A hostname no earlier run left in the cache.
const uncachedUrl = () => `https://${crypto.randomUUID()}.example.com`;

afterEach(() => {
  mock.restore();
});

describe('getFavicon', () => {
  test('returns the provider icon while fetching is enabled', async () => {
    const fetchProviderIcon = spyOn(
      providers,
      'fetchProviderIcon'
    ).mockResolvedValue(ICON);

    const result = await getFavicon(testCoreConfig(), uncachedUrl());

    expect(result.status).toBe(200);
    expect(fetchProviderIcon).toHaveBeenCalled();
  });

  test('answers 404 without asking any icon service when disabled', async () => {
    const fetchProviderIcon = spyOn(providers, 'fetchProviderIcon');

    const result = await getFavicon(
      testCoreConfig({ faviconFetchDisabled: true }),
      uncachedUrl()
    );

    expect(result.status).toBe(404);
    expect(fetchProviderIcon).not.toHaveBeenCalled();
  });
});
