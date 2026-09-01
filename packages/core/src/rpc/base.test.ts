import { expect, test } from 'bun:test';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { stubHttpCtx } from '../../test/rpc-fixtures';
import type { CookieOptions } from '../shared/cookie';
import * as baseModule from './base';
import {
  createRateLimitMiddleware,
  createTRPCRouter,
  makeTrpcContext,
  procedure,
} from './base';
import { createTrpcFetchHandler } from './handler';

// V1's COOKIE_OPTIONS (packages/auth/constants.ts) with a domain filled in.
const COOKIE_OPTIONS: CookieOptions = {
  domain: '.openpanel.dev',
  secure: true,
  sameSite: 'lax',
  httpOnly: true,
  path: '/',
};

function build(options: Partial<Parameters<typeof makeTrpcContext>[2]> = {}) {
  const { ctx, logger } = stubHttpCtx();
  const resHeaders = new Headers();
  return {
    resHeaders,
    logger,
    trpcCtx: makeTrpcContext(ctx, resHeaders, {
      cookieOptions: COOKIE_OPTIONS,
      ...options,
    }),
  };
}

test('setCookie writes through resHeaders with V1 option precedence', async () => {
  const { trpcCtx, resHeaders } = build();

  // Only maxAge and signed are caller-controlled; COOKIE_OPTIONS is spread
  // last, so everything a caller sends for the rest is ignored.
  (await trpcCtx).setCookie('session', 'the-token', {
    maxAge: 600,
    domain: 'evil.example',
    path: '/hijack',
    secure: false,
    sameSite: 'none',
    httpOnly: false,
  });

  expect(resHeaders.get('set-cookie')).toBe(
    'session=the-token; Max-Age=600; Domain=.openpanel.dev; Path=/; HttpOnly; Secure; SameSite=Lax'
  );
});

test('maxAge 0 survives (deleteSessionTokenCookie)', async () => {
  const { trpcCtx, resHeaders } = build();

  (await trpcCtx).setCookie('session', '', { maxAge: 0 });

  expect(resHeaders.get('set-cookie')).toBe(
    'session=; Max-Age=0; Domain=.openpanel.dev; Path=/; HttpOnly; Secure; SameSite=Lax'
  );
});

test('cookies append rather than overwrite', async () => {
  const { trpcCtx, resHeaders } = build();
  const ctx = await trpcCtx;

  ctx.setCookie('gsc_oauth_state', 'a', { maxAge: 600 });
  ctx.setCookie('gsc_code_verifier', 'b', { maxAge: 600 });
  ctx.setCookie('gsc_project_id', 'c', { maxAge: 600 });

  const all = resHeaders.getSetCookie();
  expect(all).toHaveLength(3);
  expect(all.map((line) => line.split('=')[0])).toEqual([
    'gsc_oauth_state',
    'gsc_code_verifier',
    'gsc_project_id',
  ]);
});

test('values are url-encoded', async () => {
  const { trpcCtx, resHeaders } = build();

  (await trpcCtx).setCookie('last-auth-provider', 'a b;c');

  expect(resHeaders.get('set-cookie')).toStartWith(
    'last-auth-provider=a%20b%3Bc;'
  );
});

test('signed cookies use the injected signer and emit no extra attribute', async () => {
  const { trpcCtx, resHeaders } = build({
    signCookie: (value) => `${value}.sig`,
  });

  (await trpcCtx).setCookie('gsc_oauth_state', 'state', {
    maxAge: 600,
    signed: true,
  });

  const header = resHeaders.get('set-cookie') ?? '';
  expect(header).toStartWith('gsc_oauth_state=state.sig;');
  expect(header.toLowerCase()).not.toContain('signed');
});

test('a signed cookie with no signer throws instead of going out unsigned', async () => {
  const { trpcCtx, resHeaders } = build();

  const ctx = await trpcCtx;
  expect(() =>
    ctx.setCookie('gsc_oauth_state', 'state', { signed: true })
  ).toThrow(/signCookie/);
  expect(resHeaders.getSetCookie()).toHaveLength(0);
});

test('resolvedSession is undefined until session() has resolved', async () => {
  const { trpcCtx } = build();
  const ctx = await trpcCtx;

  expect(ctx.resolvedSession).toBeUndefined();
  await ctx.session();
  expect(ctx.resolvedSession).toEqual({ userId: 'user_1' });
});

test('the HttpCtx is inherited, not copied — services stay lazy', async () => {
  const { ctx } = stubHttpCtx();
  const trpcCtx = await makeTrpcContext(ctx, new Headers(), {
    cookieOptions: COOKIE_OPTIONS,
  });

  expect(trpcCtx.requestId).toBe(ctx.requestId);
  expect(trpcCtx.logger).toBe(ctx.logger);
  expect(Object.getPrototypeOf(trpcCtx)).toBe(ctx);
  // `services` lives on the prototype's own descriptor; reading it here would
  // build the container, so assert only that we did not shadow it.
  expect(Object.hasOwn(trpcCtx, 'services')).toBe(false);
});

test('simulateLatency delays the context, and is off by default', async () => {
  const random = Math.random;
  Math.random = () => 1; // -> min(500, 200) = 200ms, deterministically
  try {
    const withoutStart = performance.now();
    await build().trpcCtx;
    const withoutMs = performance.now() - withoutStart;

    const withStart = performance.now();
    await build({ simulateLatency: true }).trpcCtx;
    const withMs = performance.now() - withStart;

    expect(withoutMs).toBeLessThan(50);
    expect(withMs).toBeGreaterThanOrEqual(150);
  } finally {
    Math.random = random;
  }
});

// ------------------------------------------------------- middleware factories

function mountWith(
  build: (
    base: typeof import('./base')
  ) => Parameters<typeof createTRPCRouter>[0]
) {
  const { ctx, logger } = stubHttpCtx();
  const router = createTRPCRouter(build(baseModule));
  const handler = createTrpcFetchHandler({
    router,
    logger,
    cookieOptions: COOKIE_OPTIONS,
  });
  return {
    logger,
    call: (request: Request) => handler(request, ctx),
  };
}

const postTo = (path: string) =>
  new Request(`https://api.openpanel.dev/trpc/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });

function stubCache() {
  const store = new Map<string, unknown>();
  const reads: string[] = [];
  const writes: { key: string; ttl: number; value: unknown }[] = [];
  return {
    store,
    reads,
    writes,
    cache: {
      getJson: (key: string) => {
        reads.push(key);
        return Promise.resolve((store.get(key) ?? null) as never);
      },
      setJson: (key: string, expireInSec: number, value: unknown) => {
        writes.push({ key, ttl: expireInSec, value });
        store.set(key, value);
        return Promise.resolve();
      },
    },
  };
}

test('the cache middleware keys on path + raw input and honours the ttl', async () => {
  const { cache, reads, writes } = stubCache();
  let hits = 0;

  const mounted = mountWith(({ procedure: base, createCacheMiddleware }) => ({
    overview: base
      .use(createCacheMiddleware({ cache, serveFromCache: true })(60))
      .input(z.object({ projectId: z.string() }))
      .query(() => {
        hits++;
        return { visitors: 1 };
      }),
  }));

  const url =
    'https://api.openpanel.dev/trpc/overview?input=' +
    encodeURIComponent(JSON.stringify({ json: { projectId: 'p1' } }));

  await mounted.call(new Request(url));
  await mounted.call(new Request(url));

  expect(hits).toBe(1);
  expect(reads[0]).toBe("trpc:overview:{'projectId':'p1'}");
  expect(writes).toHaveLength(1);
  expect(writes[0]?.ttl).toBe(60);
});

test('the cache is written but not served when serveFromCache is off', async () => {
  const { cache, writes } = stubCache();
  let hits = 0;

  const mounted = mountWith(({ procedure: base, createCacheMiddleware }) => ({
    overview: base
      .use(createCacheMiddleware({ cache, serveFromCache: false })(60))
      .query(() => {
        hits++;
        return { visitors: 1 };
      }),
  }));

  await mounted.call(new Request('https://api.openpanel.dev/trpc/overview'));
  await mounted.call(new Request('https://api.openpanel.dev/trpc/overview'));

  expect(hits).toBe(2);
  expect(writes).toHaveLength(2);
});

test('a zero ttl bypasses the cache entirely', async () => {
  const { cache, reads, writes } = stubCache();

  const mounted = mountWith(({ procedure: base, createCacheMiddleware }) => ({
    overview: base
      .use(createCacheMiddleware({ cache, serveFromCache: true })(() => 0))
      .query(() => ({ visitors: 1 })),
  }));

  await mounted.call(new Request('https://api.openpanel.dev/trpc/overview'));

  expect(reads).toHaveLength(0);
  expect(writes).toHaveLength(0);
});

test('mutations are never cached', async () => {
  const { cache, writes } = stubCache();

  const mounted = mountWith(({ procedure: base, createCacheMiddleware }) => ({
    save: base
      .use(createCacheMiddleware({ cache, serveFromCache: true })(60))
      .mutation(() => ({ ok: true })),
  }));

  await mounted.call(postTo('save'));

  expect(writes).toHaveLength(0);
});

test('the rate limit middleware hands the limiter ctx fields, not a request', async () => {
  const calls: unknown[] = [];
  const { ctx, logger } = stubHttpCtx({
    ip: '203.0.113.7',
    headers: new Headers({ 'user-agent': 'op-test/1.0' }),
  });

  const router = createTRPCRouter({
    signIn: procedure
      .use(
        createRateLimitMiddleware(async (args) => {
          calls.push(args);
          await Promise.resolve();
        })({ max: 5, windowMs: 60_000 })
      )
      .mutation(() => ({ ok: true })),
  });
  const handler = createTrpcFetchHandler({
    router,
    logger,
    cookieOptions: COOKIE_OPTIONS,
  });

  await handler(postTo('signIn'), ctx);

  expect(calls).toHaveLength(1);
  expect(calls[0]).toEqual({
    headers: ctx.headers,
    ip: '203.0.113.7',
    logger: ctx.logger,
    path: 'signIn',
    max: 5,
    windowMs: 60_000,
  });
});

test('a limiter rejection stops the procedure and surfaces as 429', async () => {
  let ran = false;
  const { ctx, logger } = stubHttpCtx();

  const router = createTRPCRouter({
    signIn: procedure
      .use(
        createRateLimitMiddleware(() =>
          Promise.reject(new TRPCError({ code: 'TOO_MANY_REQUESTS' }))
        )({ max: 5, windowMs: 60_000 })
      )
      .mutation(() => {
        ran = true;
        return { ok: true };
      }),
  });
  const handler = createTrpcFetchHandler({
    router,
    logger,
    cookieOptions: COOKIE_OPTIONS,
  });

  const response = await handler(postTo('signIn'), ctx);

  expect(ran).toBe(false);
  expect(response.status).toBe(429);
  expect(logger.lines[0]?.message).toBe('trpc rate limited');
});
