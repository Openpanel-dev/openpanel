import { afterEach, expect, mock, spyOn, test } from 'bun:test';
import { Elysia } from 'elysia';
import { testCoreConfig } from '../../../test/config-fixture';
import { stubAppDeps } from '../../../test/http-fixtures';
import { requestContext } from '../../http/context';
import { miscRoutes } from './misc.routes';
import * as providers from './src/favicon-providers';

afterEach(() => {
  mock.restore();
});

test('GET /misc/favicon honours DISABLE_FAVICON_FETCH from the app config', async () => {
  const fetchProviderIcon = spyOn(providers, 'fetchProviderIcon');
  const { deps } = stubAppDeps();
  const app = new Elysia()
    .use(
      requestContext({
        ...deps,
        config: testCoreConfig({ faviconFetchDisabled: true }),
      })
    )
    .use(miscRoutes(deps));

  const response = await app.handle(
    new Request(
      `http://localhost/misc/favicon?url=https://${crypto.randomUUID()}.example.com`
    )
  );

  expect(response.status).toBe(404);
  expect(fetchProviderIcon).not.toHaveBeenCalled();
});
