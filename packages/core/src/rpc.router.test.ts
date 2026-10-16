import { expect, test } from 'bun:test';
import { testCoreConfig } from '../test/config-fixture';
import { stubHttpCtx } from '../test/rpc-fixtures';
import { createTrpcFetchHandler } from './rpc/handler';
import { appRouter } from './rpc.router';
import type { CookieOptions } from './shared/cookie';

const COOKIE_OPTIONS: CookieOptions = {
  domain: '.openpanel.dev',
  secure: true,
  sameSite: 'lax',
  httpOnly: true,
  path: '/',
};

test('the composed appRouter serves the health procedure', async () => {
  const { ctx, logger } = stubHttpCtx();
  const handler = createTrpcFetchHandler({
    router: appRouter,
    logger,
    cookieOptions: COOKIE_OPTIONS,
    ipHeaders: testCoreConfig().ipHeaders,
  });

  const response = await handler(
    new Request('https://api.openpanel.dev/trpc/health.live'),
    ctx
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    result: { data: { json: { live: true } } },
  });
});
