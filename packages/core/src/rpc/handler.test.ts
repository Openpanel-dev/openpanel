import { expect, test } from 'bun:test';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { testCoreConfig } from '../../test/config-fixture';
import {
  capturingLogger,
  stubHttpCtx,
  TEST_SESSION,
} from '../../test/rpc-fixtures';
import type { CookieOptions } from '../shared/cookie';
import { createTRPCRouter, makeTrpcContext, procedure } from './base';
import { TRPCForbiddenError } from './errors';
import {
  createTrpcFetchHandler,
  createTrpcOnError,
  type TrpcErrorReport,
} from './handler';

const COOKIE_OPTIONS: CookieOptions = {
  domain: '.openpanel.dev',
  secure: true,
  sameSite: 'lax',
  httpOnly: true,
  path: '/',
};

function report(overrides: Partial<TrpcErrorReport> = {}): TrpcErrorReport {
  return {
    error: new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'boom' }),
    path: 'report.get',
    input: { projectId: 'p1' },
    type: 'query',
    ctx: undefined,
    req: new Request('https://api.openpanel.dev/trpc/report.get', {
      headers: {
        'user-agent': 'op-test/1.0',
        'cf-connecting-ip': '203.0.113.7',
      },
    }),
    ...overrides,
  };
}

test('UNAUTHORIZED on organization.list is dropped', () => {
  const logger = capturingLogger();

  createTrpcOnError(
    logger,
    testCoreConfig().ipHeaders
  )(
    report({
      error: new TRPCError({ code: 'UNAUTHORIZED' }),
      path: 'organization.list',
    })
  );

  expect(logger.lines).toHaveLength(0);
});

test('the drop is scoped to that one path', () => {
  const logger = capturingLogger();

  createTrpcOnError(
    logger,
    testCoreConfig().ipHeaders
  )(
    report({
      error: new TRPCError({ code: 'UNAUTHORIZED' }),
      path: 'organization.get',
    })
  );

  expect(logger.lines).toHaveLength(1);
  expect(logger.lines[0]?.level).toBe('error');
});

test('TOO_MANY_REQUESTS logs at warn as "trpc rate limited"', () => {
  const logger = capturingLogger();

  createTrpcOnError(
    logger,
    testCoreConfig().ipHeaders
  )(report({ error: new TRPCError({ code: 'TOO_MANY_REQUESTS' }) }));

  expect(logger.lines).toHaveLength(1);
  expect(logger.lines[0]?.level).toBe('warn');
  expect(logger.lines[0]?.message).toBe('trpc rate limited');
});

test('everything else logs at error as "trpc error", with the expected fields', () => {
  const logger = capturingLogger();
  const failure = report();

  createTrpcOnError(logger, testCoreConfig().ipHeaders)(failure);

  expect(logger.lines).toHaveLength(1);
  const [line] = logger.lines;
  expect(line?.level).toBe('error');
  expect(line?.message).toBe('trpc error');
  expect(line?.payload).toEqual({
    err: failure.error,
    path: 'report.get',
    input: { projectId: 'p1' },
    type: 'query',
    session: undefined,
    ip: '203.0.113.7',
    ipHeader: 'cf-connecting-ip',
    userAgent: 'op-test/1.0',
  });
});

test('the request logger is preferred and the resolved session is carried', async () => {
  const bootLogger = capturingLogger();
  const { ctx, logger: requestLogger } = stubHttpCtx();
  const trpcCtx = await makeTrpcContext(ctx, new Headers(), {
    cookieOptions: COOKIE_OPTIONS,
  });

  createTrpcOnError(
    bootLogger,
    testCoreConfig().ipHeaders
  )(report({ ctx: trpcCtx }));

  expect(bootLogger.lines).toHaveLength(0);
  expect(requestLogger.lines).toHaveLength(1);
  expect(
    (requestLogger.lines[0]?.payload as { session: unknown }).session
  ).toEqual(TEST_SESSION);
});

test('a ctx-less failure (createContext threw) logs through the boot logger', () => {
  const bootLogger = capturingLogger();

  expect(() =>
    createTrpcOnError(
      bootLogger,
      testCoreConfig().ipHeaders
    )(report({ ctx: undefined }))
  ).not.toThrow();

  expect(bootLogger.lines).toHaveLength(1);
  expect(bootLogger.lines[0]?.message).toBe('trpc error');
});

test('an untrusted forwarded ip is ignored', () => {
  const logger = capturingLogger();

  createTrpcOnError(
    logger,
    testCoreConfig().ipHeaders
  )(
    report({
      req: new Request('https://api.openpanel.dev/trpc/report.get', {
        headers: { 'x-client-ip': '198.51.100.9' },
      }),
    })
  );

  const payload = logger.lines[0]?.payload as { ip: string; ipHeader: string };
  expect(payload.ip).toBe('');
  expect(payload.ipHeader).toBe('');
});

const router = createTRPCRouter({
  ping: procedure.query(() => ({ pong: true })),
  signIn: procedure
    .input(z.object({ email: z.email() }))
    .mutation(({ ctx, input }) => {
      ctx.setCookie('session', `token-for-${input.email}`, { maxAge: 600 });
      return { ok: true };
    }),
  forbidden: procedure.query(() => {
    throw new TRPCForbiddenError('nope');
  }),
});

function mount() {
  // One logger for both channels: which of the two a line took is asserted by
  // the onError tests above, not here.
  const logger = capturingLogger();
  const { ctx } = stubHttpCtx({ logger });
  const handler = createTrpcFetchHandler({
    router,
    logger,
    cookieOptions: COOKIE_OPTIONS,
    ipHeaders: testCoreConfig().ipHeaders,
  });
  return { logger, call: (request: Request) => handler(request, ctx) };
}

test('a query resolves through the superjson envelope', async () => {
  const response = await mount().call(
    new Request('https://api.openpanel.dev/trpc/ping')
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    result: { data: { json: { pong: true } } },
  });
});

test('Set-Cookie survives the raw Response the handler returns', async () => {
  const response = await mount().call(
    new Request('https://api.openpanel.dev/trpc/signIn', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ json: { email: 'carl@openpanel.dev' } }),
    })
  );

  expect(response.status).toBe(200);
  expect(response.headers.get('set-cookie')).toBe(
    'session=token-for-carl%40openpanel.dev; Max-Age=600; Domain=.openpanel.dev; Path=/; HttpOnly; Secure; SameSite=Lax'
  );
});

test('a ZodError is flattened onto data.zodError', async () => {
  const response = await mount().call(
    new Request('https://api.openpanel.dev/trpc/signIn', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ json: { email: 'not-an-email' } }),
    })
  );

  expect(response.status).toBe(400);
  const body = (await response.json()) as {
    error: {
      json: { data: { code: string; zodError: { fieldErrors: unknown } } };
    };
  };
  expect(body.error.json.data.code).toBe('BAD_REQUEST');
  expect(body.error.json.data.zodError.fieldErrors).toEqual({
    email: ['Invalid email address'],
  });
});

test('a TRPCForbiddenError is a 403 with a null zodError', async () => {
  const response = await mount().call(
    new Request('https://api.openpanel.dev/trpc/forbidden')
  );

  expect(response.status).toBe(403);
  const body = (await response.json()) as {
    error: {
      json: { message: string; data: { code: string; zodError: null } };
    };
  };
  expect(body.error.json.message).toBe('nope');
  expect(body.error.json.data.code).toBe('FORBIDDEN');
  expect(body.error.json.data.zodError).toBeNull();
});

test('an unknown procedure is a 404 and is logged', async () => {
  const mounted = mount();
  const response = await mounted.call(
    new Request('https://api.openpanel.dev/trpc/nope.nope')
  );

  expect(response.status).toBe(404);
  expect(mounted.logger.lines[0]?.message).toBe('trpc error');
});

// The client does not batch today; this guards the `.all('/trpc/*')` wildcard
// against a future httpBatchLink, whose path segment carries commas.
test('a batched request resolves every procedure in the segment', async () => {
  const response = await mount().call(
    new Request('https://api.openpanel.dev/trpc/ping,ping?batch=1&input={}')
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual([
    { result: { data: { json: { pong: true } } } },
    { result: { data: { json: { pong: true } } } },
  ]);
});

const SHORT_DEADLINE_MS = 20;
const NEVER_FINISHES_MS = 60_000;

const slowRouter = createTRPCRouter({
  // Ignores every signal, so only the cancellation race can answer it.
  stuck: procedure.query(
    () =>
      new Promise((resolve) => {
        setTimeout(resolve, NEVER_FINISHES_MS).unref();
      })
  ),
});

function mountCancellable() {
  const logger = capturingLogger();
  const cancellation = new AbortController();
  const { ctx } = stubHttpCtx({ logger, cancellation });
  const handler = createTrpcFetchHandler({
    router: slowRouter,
    logger,
    cookieOptions: COOKIE_OPTIONS,
    ipHeaders: testCoreConfig().ipHeaders,
    deadlineMs: SHORT_DEADLINE_MS,
  });
  return {
    logger,
    cancellation,
    call: () =>
      handler(new Request('https://api.openpanel.dev/trpc/stuck'), ctx),
  };
}

interface ErrorBody {
  error: {
    json: { message: string; data: { code: string; httpStatus: number } };
  };
}

test('a call past the deadline is answered with an explained TIMEOUT, sent as 504', async () => {
  const mounted = mountCancellable();

  const response = await mounted.call();

  expect(response.status).toBe(504);
  const body = (await response.json()) as ErrorBody;
  expect(body.error.json.data.code).toBe('TIMEOUT');
  // The dashboard reads this to decide against retrying.
  expect(body.error.json.data.httpStatus).toBe(408);
  expect(body.error.json.message).toContain('took longer than 0.02 seconds');
  expect(mounted.cancellation.signal.aborted).toBe(true);
  expect(mounted.logger.lines[0]?.level).toBe('error');
});

test('a client disconnect stops the call and is logged as abandoned', async () => {
  const mounted = mountCancellable();

  const pending = mounted.call();
  mounted.cancellation.abort(new DOMException('gone', 'AbortError'));
  const response = await pending;

  expect(response.status).toBe(499);
  const body = (await response.json()) as ErrorBody;
  expect(body.error.json.data.code).toBe('CLIENT_CLOSED_REQUEST');
  expect(mounted.logger.lines[0]?.level).toBe('warn');
  expect(mounted.logger.lines[0]?.message).toBe('trpc request abandoned');
});

test('a call that finishes in time disarms the deadline', async () => {
  const logger = capturingLogger();
  const cancellation = new AbortController();
  const { ctx } = stubHttpCtx({ logger, cancellation });
  const handler = createTrpcFetchHandler({
    router,
    logger,
    cookieOptions: COOKIE_OPTIONS,
    ipHeaders: testCoreConfig().ipHeaders,
    deadlineMs: SHORT_DEADLINE_MS,
  });

  const response = await handler(
    new Request('https://api.openpanel.dev/trpc/ping'),
    ctx
  );
  await new Promise((resolve) => setTimeout(resolve, SHORT_DEADLINE_MS * 2));

  expect(response.status).toBe(200);
  expect(cancellation.signal.aborted).toBe(false);
});
