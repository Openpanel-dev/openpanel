// V1's tRPC surface, rebased onto @openpanel/core's RPC base (ADR-009).
//
// There is exactly ONE tRPC instance in the repo now: `initTRPC` is called in
// core/src/rpc/base.ts and nowhere else, so the transformer, the
// errorFormatter, `Meta` and the context type are single-sourced. V1 keeps its
// Fastify adapter and V2 gets `createTrpcFetchHandler`; both mount routers
// built from the same `procedure`.
//
// What still lives here is what core cannot import without pulling a database
// into a package that must stay bootable with none: the procedures below need
// `runWithAlsSession` and the access ladder's real lookups. They move into
// core with auth at P6, at which point this file is a re-export.

import { COOKIE_OPTIONS, type SessionValidationResult } from '@openpanel/auth';
import {
  type Ctx,
  createCacheMiddleware,
  createRateLimitMiddleware,
  middleware,
  procedure,
  type QueueProducers,
  type RpcCache,
  type TrpcContext,
} from '@openpanel/core';
import { runWithAlsSession } from '@openpanel/db';
import { getRedisCache } from '@openpanel/redis';
import { TRPCError } from '@trpc/server';
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { has } from 'ramda';
import { getOrganizationAccess, requireProjectAccess } from './access';
import { TRPCForbiddenError } from './errors';
import { enforceRateLimit } from './rate-limit';

export type { Meta } from '@openpanel/core';
export { createTRPCRouter } from '@openpanel/core';

/** What a procedure receives. Core's type, not a second declaration. */
export type Context = TrpcContext;

/** What apps/api's hooks decorate the request with (apps/api/src/app.ts). */
type FastifyRequestWithSession = CreateFastifyContextOptions['req'] & {
  session: SessionValidationResult;
  cookies?: Record<string, string | undefined>;
  clientIp?: string;
};

const ARTIFICIAL_LATENCY_SPREAD_MS = 500;
const ARTIFICIAL_LATENCY_MAX_MS = 200;

/**
 * The V1 Fastify adapter's context builder.
 *
 * It is deliberately not core's `makeTrpcContext`: that one writes cookies
 * through the fetch adapter's `resHeaders`, while Fastify's reply is the
 * guaranteed path out here, and V1's session is already resolved by the
 * `onRequest` hook in apps/api/src/app.ts. Everything else — the option
 * precedence, the artificial latency, the fields — is V1's, unchanged.
 *
 * V2's builder is `makeTrpcContext`; this one dies with `apps/worker` at P9.
 */
export async function createContext({
  req,
  res,
}: CreateFastifyContextOptions): Promise<Context> {
  const request = req as FastifyRequestWithSession;
  // @fastify/cookie decorates the reply, and this package does not depend on
  // fastify, so the decoration is named here rather than suppressed.
  const reply = res as unknown as {
    setCookie(
      name: string,
      value: string,
      options: Record<string, unknown>
    ): void;
  };

  const setCookie = (
    key: string,
    value: string,
    options: { maxAge?: number; signed?: boolean } = {}
  ) => {
    reply.setCookie(key, value, {
      maxAge: options.maxAge,
      signed: options.signed,
      ...COOKIE_OPTIONS,
    });
  };

  if (process.env.NODE_ENV !== 'production') {
    await new Promise((resolve) =>
      setTimeout(
        () => resolve(1),
        Math.min(
          Math.random() * ARTIFICIAL_LATENCY_SPREAD_MS,
          ARTIFICIAL_LATENCY_MAX_MS
        )
      )
    );
  }

  const cookies = request.cookies;

  return {
    ...v1CtxScope(req),
    headers: toHeaders(req.headers),
    // The attribution ip, as core defines it (ipHook / getClientIpFromHeaders).
    // The limiter must not key on it - that is what `remoteAddress` is for.
    ip: request.clientIp ?? '',
    remoteAddress: req.socket?.remoteAddress,
    demoMode: !!process.env.DEMO_USER_ID,
    cookies: { get: (name: string) => cookies?.[name] },
    setCookie,
    // Already resolved by app.ts's onRequest hook. Under V2 the fetch
    // adapter's context builder resolves it instead; either way a procedure
    // reads a value, exactly as V1's routers always have.
    session: request.session,
  };
}

/**
 * The `Ctx` half of the context under V1.
 *
 * `db`/`ch`/`redis`/`clients`/`buffers` are core's `unknown` stubs until P3-P8
 * wire the real clients, and V1's routers reach for their own singletons
 * regardless. `queues` throws rather than returning an empty object: a V1
 * router that tried to enqueue through core would otherwise silently do
 * nothing.
 */
function v1CtxScope(req: CreateFastifyContextOptions['req']): Ctx {
  return {
    db: undefined,
    ch: undefined,
    redis: undefined,
    clients: undefined,
    buffers: undefined,
    logger: req.log,
    queues: NOT_WIRED_QUEUES,
    services: {},
    requestId: String(req.id),
  };
}

const NOT_WIRED_QUEUES = new Proxy({} as QueueProducers, {
  get(_target, name) {
    throw new Error(
      `ctx.queues.${String(name)} is not wired on the V1 Fastify path — enqueue through @openpanel/queue, as the rest of V1 does`
    );
  },
});

/** Node's header bag is a record of strings and string arrays; core wants a `Headers`. */
function toHeaders(source: Record<string, string | string[] | undefined>) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        headers.append(name, entry);
      }
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  return headers;
}

const enforceUserIsAuthed = middleware(async ({ ctx, next }) => {
  if (!ctx.session?.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }

  try {
    return next({
      ctx: {
        session: { ...ctx.session },
      },
    });
  } catch (error) {
    console.error('Failes to get user', error);
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Failed to get user',
    });
  }
});

// Only used on protected routes
const enforceAccess = middleware(
  async ({ ctx, next, type, meta, getRawInput }) => {
    const sessionId = ctx.session?.session?.id ?? null;
    return runWithAlsSession(sessionId, async () => {
      const rawInput = await getRawInput();
      if (type === 'mutation' && ctx.demoMode) {
        throw new TRPCForbiddenError(
          'You are not allowed to do this in demo mode'
        );
      }

      if (has('projectId', rawInput)) {
        // Fails closed: any procedure that takes a top-level projectId requires
        // write access to mutate, including ones added later. Procedures that
        // resolve the project from a reportId/dashboardId/etc. are invisible to
        // this check and call requireProjectAccess in the handler instead.
        const needsWrite = type === 'mutation' && !meta?.readOnlyMutation;

        await requireProjectAccess({
          userId: ctx.session.userId!,
          projectId: rawInput.projectId as string,
          level: needsWrite ? 'write' : 'read',
        });
      }

      if (has('organizationId', rawInput)) {
        const access = await getOrganizationAccess({
          userId: ctx.session.userId!,
          organizationId: rawInput.organizationId as string,
        });

        if (!access) {
          throw new TRPCForbiddenError(
            'You do not have access to this organization'
          );
        }
      }

      return next();
    });
  }
);

const loggerMiddleware = middleware(
  async ({ ctx, next, getRawInput, path, input, type }) => {
    const rawInput = await getRawInput();
    // Only log mutations
    if (type === 'mutation') {
      ctx.logger.info(
        {
          path,
          rawInput,
          input,
          userId: ctx.session?.userId,
          organizationId: has('organizationId', rawInput)
            ? rawInput.organizationId
            : undefined,
          projectId: has('projectId', rawInput)
            ? rawInput.projectId
            : undefined,
        },
        'TRPC mutation'
      );
    }
    return next();
  }
);

const sessionScopeMiddleware = middleware(async ({ ctx, next }) => {
  const sessionId = ctx.session?.session?.id ?? null;
  return runWithAlsSession(sessionId, async () => {
    return next();
  });
});

/**
 * Throttle a procedure by client IP, with an exponentially growing lockout for
 * repeat offenders. See `./rate-limit` for the escalation rules and for the log
 * line (`rate limit blocked`) that carries the offending IP.
 */
export const rateLimitMiddleware = createRateLimitMiddleware(enforceRateLimit);

export const publicProcedure = procedure
  .use(loggerMiddleware)
  .use(sessionScopeMiddleware);
export const protectedProcedure = procedure
  .use(enforceUserIsAuthed)
  .use(enforceAccess)
  .use(loggerMiddleware)
  .use(sessionScopeMiddleware);
// Authenticated but WITHOUT the org/project membership check. Use for endpoints
// that must answer for any logged-in user (e.g. checking your own access to an
// org you may not belong to) and return null instead of throwing.
export const protectedProcedureWithoutAccess = procedure
  .use(enforceUserIsAuthed)
  .use(loggerMiddleware)
  .use(sessionScopeMiddleware);

/**
 * The Redis handle is resolved per call, not at import: `getRedisCache()` opens
 * a connection, and V1 did not open one because a router module was loaded.
 */
const rpcCache: RpcCache = {
  getJson: (key) => getRedisCache().getJson(key),
  setJson: (key, expireInSec, value) =>
    getRedisCache().setJson(key, expireInSec, value),
};

export const cacheMiddleware = createCacheMiddleware({
  cache: rpcCache,
  // A thunk, because V1 read NODE_ENV on every request rather than once when
  // the router module was first imported.
  serveFromCache: () => process.env.NODE_ENV === 'production',
});
