import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { testCoreConfig } from '../../../test/config-fixture';
import { getFavicon } from './misc.service';
import * as providers from './src/favicon-providers';

afterEach(() => {
  mock.restore();
});

describe('getFavicon with DISABLE_FAVICON_FETCH', () => {
  test('answers 404 without asking any icon service', async () => {
    const fetchProviderIcon = spyOn(providers, 'fetchProviderIcon');

    const result = await getFavicon(
      testCoreConfig({ faviconFetchDisabled: true }),
      'https://openpanel.dev'
    );

    expect(result.status).toBe(404);
    expect(fetchProviderIcon).not.toHaveBeenCalled();
  });
});
