import { beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { Elysia } from 'elysia';
import { stubAppDeps } from '../../test/http-fixtures';
import type { HttpCtx } from '../context';
import type { Services } from '../services';

// mock.module is not hoisted, so the subjects are imported inside beforeAll —
// see AGENTS.md. Mocking createServices is what makes "not built yet"
// observable at all: the real container is `{}` either way.
const createServices = mock((): Services => ({}));
mock.module('../services', () => ({ createServices }));

const resolveSession = mock(() => Promise.resolve({ userId: 'user_1' }));
mock.module('./session', () => ({
  SESSION_COOKIE_NAME: 'session',
  resolveSession,
}));

let requestContext: typeof import('./context').requestContext;
let requestLogging: typeof import('./context').requestLogging;

beforeAll(async () => {
  ({ requestContext, requestLogging } = await import('./context'));
});

beforeEach(() => {
  createServices.mockClear();
  resolveSession.mockClear();
});

// onAfterResponse runs after `handle` resolves — the response is already on
// its way out, which is the point of logging there.
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

// The claim ADR-002 and ADR-007 both rest on: thirty modules may each start
// from `.use(requestContext(deps))` and one request still builds one Ctx.
test('derives one ctx per request however many modules use the plugin', async () => {
  const { deps, scopeCalls, childCalls } = stubAppDeps();
  const seen: HttpCtx[] = [];

  // Each observer records the ctx it was handed; the route is registered on
  // the parent AFTER them, because an Elysia hook only applies to routes
  // declared after it.
  const observing = () =>
    new Elysia()
      .use(requestContext(deps))
      .onAfterResponse({ as: 'global' }, ({ ctx }) => {
        seen.push(ctx);
      });

  const app = new Elysia()
    .use(observing())
    .use(observing())
    .use(observing())
    .get('/a', ({ ctx }) => ctx.requestId);

  const response = await app.handle(
    new Request('http://localhost/a', { headers: { 'request-id': 'once' } })
  );

  expect(await response.text()).toBe('once');
  await settled();

  expect(scopeCalls()).toBe(1);
  expect(childCalls()).toEqual([{ requestId: 'once' }]);
  expect(seen).toHaveLength(3);
  expect(seen[0]).toBe(seen[1] as HttpCtx);
  expect(seen[1]).toBe(seen[2] as HttpCtx);
});

describe('the derived HttpCtx', () => {
  const build = () => {
    const stub = stubAppDeps();
    const app = new Elysia()
      .use(requestContext(stub.deps))
      .get('/', ({ ctx }) => ({
        requestId: ctx.requestId,
        ip: ctx.ip,
        userAgent: ctx.headers.get('user-agent'),
        session: ctx.cookies.get('session'),
        missing: ctx.cookies.get('nothing') ?? null,
      }))
      .get('/services', ({ ctx }) => ({
        first: ctx.services,
        second: ctx.services,
      }))
      .get('/session', async ({ ctx }) => {
        await ctx.session();
        await ctx.session();
        return 'resolved';
      })
      .get('/set-cookie', ({ ctx }) => {
        ctx.setCookie('session', 'token-1', {
          maxAge: 60,
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          secure: true,
        });
        return 'set';
      });
    return { app, ...stub };
  };

  test('carries headers, the attribution ip and the cookies', async () => {
    const { app } = build();

    const response = await app.handle(
      new Request('http://localhost/', {
        headers: {
          'request-id': 'ctx-fields',
          'x-real-ip': '203.0.113.11',
          'user-agent': 'op-sdk/1.0',
          cookie: 'session=cookie-value; other=1',
        },
      })
    );

    expect(await response.json()).toEqual({
      requestId: 'ctx-fields',
      ip: '203.0.113.11',
      userAgent: 'op-sdk/1.0',
      session: 'cookie-value',
      missing: null,
    });
  });

  test('leaves services unbuilt until a handler reads them, then builds once', async () => {
    const { app } = build();

    await app.handle(new Request('http://localhost/'));
    expect(createServices).not.toHaveBeenCalled();

    await app.handle(new Request('http://localhost/services'));
    expect(createServices).toHaveBeenCalledTimes(1);
  });

  test('memoizes session() so two guards and a handler cost one lookup', async () => {
    const { app } = build();

    await app.handle(new Request('http://localhost/session'));

    expect(resolveSession).toHaveBeenCalledTimes(1);
  });

  test('writes Set-Cookie through Elysia with V1 attributes', async () => {
    const { app } = build();

    const response = await app.handle(
      new Request('http://localhost/set-cookie')
    );

    expect(response.headers.getSetCookie()).toEqual([
      'session=token-1; Max-Age=60; Path=/; HttpOnly; Secure; SameSite=Lax',
    ]);
  });
});

describe('requestLogging', () => {
  const build = (verboseClientIds?: string[]) => {
    const stub = stubAppDeps();
    const app = new Elysia()
      .use(requestLogging(stub.deps, { verboseClientIds }))
      .get('/healthz/live', () => 'ok')
      .get('/trpc/report.list', () => 'ok')
      .post('/track', ({ body }) => body)
      .get('/export/events', () => 'ok');
    return { app, ...stub };
  };

  const lines = (stub: ReturnType<typeof build>) =>
    stub.logger.lines.filter((line) => line.message === 'request done');

  test('logs one line per request, with the requestId bound by the child logger', async () => {
    const stub = build();

    await stub.app.handle(
      new Request('http://localhost/export/events', {
        headers: {
          'request-id': 'logged',
          'openpanel-client-id': 'client-1',
          'openpanel-sdk-name': 'web',
        },
      })
    );

    await settled();

    expect(stub.childCalls()).toEqual([{ requestId: 'logged' }]);
    expect(lines(stub)).toHaveLength(1);
    expect(lines(stub)[0]?.payload).toMatchObject({
      url: '/export/events',
      method: 'GET',
      headers: {
        'openpanel-client-id': 'client-1',
        'openpanel-sdk-name': 'web',
      },
      clientIp: '',
      clientIpHeader: '',
      userAgent: '',
    });
  });

  test('skips the health, metrics and misc surfaces and OPTIONS', async () => {
    const stub = build();

    await stub.app.handle(new Request('http://localhost/healthz/live'));
    await stub.app.handle(
      new Request('http://localhost/export/events', { method: 'OPTIONS' })
    );

    await settled();

    expect(lines(stub)).toHaveLength(0);
  });

  test('logs the tRPC input rather than the query string', async () => {
    const stub = build();

    await stub.app.handle(
      new Request(
        `http://localhost/trpc/report.list?input=${encodeURIComponent(
          JSON.stringify({ json: { projectId: 'proj-1' } })
        )}`
      )
    );

    await settled();

    expect(lines(stub)[0]?.payload).toMatchObject({
      url: '/trpc/report.list',
      input: { projectId: 'proj-1' },
    });
  });

  test('logs the /track body, and the ip only for a verbose client id', async () => {
    const stub = build(['client-verbose']);

    await stub.app.handle(
      new Request('http://localhost/track', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'openpanel-client-id': 'client-verbose',
          'x-real-ip': '203.0.113.12',
          'user-agent': 'op-sdk/1.0',
        },
        body: JSON.stringify({ type: 'track' }),
      })
    );

    await settled();

    expect(lines(stub)[0]?.payload).toMatchObject({
      url: '/track',
      body: { type: 'track' },
      clientIp: '203.0.113.12',
      clientIpHeader: 'x-real-ip',
      userAgent: 'op-sdk/1.0',
    });
  });
});
