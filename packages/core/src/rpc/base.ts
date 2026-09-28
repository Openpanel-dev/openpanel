// The tRPC instance, its context, and the middleware factories procedures are
// built from.
//
// The tRPC context IS the Elysia-derived `HttpCtx`: `makeTrpcContext` adds the
// tRPC-specific bits and overrides exactly one field. There is no `req`/`res`
// here — a procedure reads `ctx.headers`, `ctx.ip`, `ctx.logger`.
//
// `transformer`, `errorFormatter` and `Meta` are verbatim from
// packages/trpc/src/trpc.ts:44-67; error semantics are unchanged by decision.

import { initTRPC, TRPCError } from '@trpc/server';
import { has } from 'ramda';
import superjson from 'superjson';
import { ZodError, z } from 'zod';
import type { HttpCtx, Session } from '../context';
import type { Logger } from '../logger';
import { runWithAlsSession } from '../shared/als-session';
import { type CookieOptions, serializeCookie } from '../shared/cookie';
import { classifyDriverError } from '../shared/driver-errors';
import { EMPTY_SESSION } from '../shared/session';
import { cancelledCallError, raceCancellation } from './deadline';
import { TRPCForbiddenError } from './errors';

/**
 * Per-procedure metadata consulted by `enforceAccess`.
 *
 * A tRPC mutation is not always a mutation of project *state* - the AI helpers
 * are one-shot compute that happen to be modelled as mutations. Those may run
 * at read level. The default is write, so forgetting to set this fails closed.
 */
export interface Meta {
  /** This mutation does not change project state; read access is enough. */
  readOnlyMutation?: boolean;
}

/**
 * What tRPC procedures see: `HttpCtx` with `session` already resolved, plus
 * two RPC-only fields.
 *
 * `session` is the one field this OVERRIDES. On an HTTP route it is the lazy,
 * memoized resolver, so a public route pays nothing; on an RPC call it is the
 * resolved value, because V1 resolved it in a Fastify `onRequest` hook for
 * every /trpc request and 134 procedure call sites read it as one. Resolving
 * in the context builder is also what lets `onError` log it without awaiting.
 *
 * It is not merely convenience: a middleware that *changed* `session`'s type
 * would make every standalone middleware (`cacheMiddleware`,
 * `rateLimitMiddleware`) unusable after it, because tRPC types `.use()`
 * against the context as overwritten so far.
 */
export interface TrpcContext extends Omit<HttpCtx, 'session'> {
  readonly session: Session;
  /**
   * The connection's peer address — the one address a client cannot forge, and
   * therefore the rate limiter's last-resort fallback when no trusted header is
   * present. It is NOT `ctx.ip`: that is the *attribution* ip, which prefers
   * client-forwarded headers and would give every request its own bucket
   * (ADR-002 "behaviour that must be preserved explicitly" 2).
   *
   * `undefined` where the transport does not expose it. Elysia's
   * `server.requestIP` is not plumbed through `HttpCtx` yet, so the fetch mount
   * leaves it unset and the limiter falls back to its shared `unknown` bucket —
   * fail-closed, which is the documented intent.
   */
  readonly remoteAddress: string | undefined;
  /**
   * `DEMO_USER_ID` is set. Core reads no environment, so the flag arrives on
   * the context; the demo-mode mutation ban is `enforceAccess`'s to apply.
   */
  readonly demoMode: boolean;
}

const t = initTRPC
  .context<TrpcContext>()
  .meta<Meta>()
  .create({
    transformer: superjson,
    errorFormatter({ shape, error }) {
      return {
        ...shape,
        data: {
          ...shape.data,
          zodError:
            error.cause instanceof ZodError
              ? z.flattenError(error.cause)
              : null,
        },
      };
    },
  });

export const createTRPCRouter = t.router;
export const middleware = t.middleware;

/**
 * Answers the caller as soon as the request's work is cancelled (deadline or
 * disconnect), rather than when the work notices.
 */
const stopWhenCancelled = t.middleware(async ({ ctx, next }) => {
  const signal = ctx.cancellation?.signal;
  if (!signal) {
    return next();
  }
  const result = await raceCancellation(next(), signal);
  // An aborted read surfaces as a transport error; report why it stopped.
  if (!result.ok && signal.aborted) {
    throw cancelledCallError(signal.reason);
  }
  return result;
});

/**
 * The bare procedure. It authenticates NOTHING. Use one of the three builders
 * below unless a procedure's V1 twin was written on `procedure` itself — the
 * only ones are the share-aware `chartProcedure`/`overviewProcedure` bases,
 * and those are `publicProcedure` plus their own middleware.
 */
/**
 * Turns a driver failure caused by the CALLER into the status it deserves.
 *
 * A malformed id raised Prisma P2023 before any `findUnique` null check could
 * run, so procedures with a perfectly good not-found guard still answered 500
 * — with the driver's own message, which for ClickHouse echoes the generated
 * SQL. Anything `classifyDriverError` does not recognise is rethrown
 * untouched and stays a 500, because a query bug is not the caller's mistake.
 *
 * This sits on `procedure` itself, which every builder derives from, so all
 * 177 procedures are covered by one `.use()`.
 */
const mapDriverErrors = t.middleware(async ({ next }) => {
  const result = await next();
  if (result.ok) {
    return result;
  }

  const cause = result.error.cause;
  const failure = classifyDriverError(cause);
  if (!failure) {
    return result;
  }

  throw new TRPCError({ code: failure.trpc, message: failure.message });
});

export const procedure = t.procedure
  .use(stopWhenCancelled)
  .use(mapDriverErrors);

// --------------------------------------------------------------------------
// The procedure stack, ported from packages/trpc/src/trpc.ts:35-155.
//
// Is this code's law; invariants 1-13 are binding. Three properties of the port
// are load-bearing and are the reason it is a middleware stack rather than
// per-handler code:
//
// 1. AUTHENTICATION RUNS BEFORE INPUT PARSING. tRPC runs `.use` middleware
// ahead of the `.input` parser, so an anonymous caller gets UNAUTHORIZED
// whatever it sends. Doing the same check inside a handler inverts that: the
// caller learns the input shape first, and 176 procedures changed answer from
// 401 to 400 when core mounted the bare `procedure`. 2. THE CHECK CANNOT BE
// FORGOTTEN. It is a property of the builder, not of a line a port might drop.
// Three procedures (`client.list`, `subscription.getCurrent`,
// `subscription.usage`) had no check at all while this stack was missing. 3.
// `enforceAccess` READS THE RAW, PRE-ZOD INPUT (ADR-011 invariant 2) and only
// its TOP-LEVEL `projectId` / `organizationId`. A procedure that resolves the
// project from a reportId/dashboardId is invisible to it and keeps its
// in-handler check — ADR-011 counts 58 of those, and a redundant check is
// harmless where a missing one is not.
//
// The lookups arrive through `ctx.services.auth` (M10-002 bound the ladder
// there, once, in auth.service.ts); core reaches no database directly.
// ---------------------------------------------------------------------------

const enforceUserIsAuthed = t.middleware(async ({ ctx, next }) => {
  const session = ctx.session;
  if (!session?.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }

  try {
    // Narrowed, not merely copied: the spread of the checked union member is
    // what gives every handler below a `session.userId` of type `string`, so a
    // procedure reads it instead of re-deriving it through a per-file
    // `requireLogin` (ADR-022 R10 — 38 of those, deleted at M15-007).
    return next({
      ctx: {
        session: { ...session },
      },
    });
  } catch (error) {
    // V1 wrote this to `console.error`; core has a request-scoped logger on
    // the context and CLAUDE.md bans `console` in shipped code. Same branch,
    // same outcome, same (misspelled, kept) message.
    ctx.logger.error({ err: error }, 'Failes to get user');
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Failed to get user',
    });
  }
});

// Only used on protected routes
const enforceAccess = t.middleware(
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

        await ctx.services.auth.requireProjectAccess({
          userId: ctx.session.userId as string,
          projectId: rawInput.projectId as string,
          level: needsWrite ? 'write' : 'read',
        });
      }

      if (has('organizationId', rawInput)) {
        const access = await ctx.services.auth.getOrganizationAccess({
          userId: ctx.session.userId as string,
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

const loggerMiddleware = t.middleware(
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

const sessionScopeMiddleware = t.middleware(async ({ ctx, next }) => {
  const sessionId = ctx.session?.session?.id ?? null;
  return runWithAlsSession(sessionId, async () => {
    return next();
  });
});

/** Anyone, signed in or not. Still session-scoped and mutation-logged. */
export const publicProcedure = procedure
  .use(loggerMiddleware)
  .use(sessionScopeMiddleware);
/** Signed in, plus the project/organization check on the raw input. */
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

// V1 delayed every non-production request by up to 200ms so a developer felt
// the latency a user does. Preserved, with the flag injected: core reads no
// process.env.
const ARTIFICIAL_LATENCY_SPREAD_MS = 500;
const ARTIFICIAL_LATENCY_MAX_MS = 200;

export interface TrpcContextOptions {
  /**
   * V1's `COOKIE_OPTIONS`. Deployment-derived (it reads `DASHBOARD_URL`), so
   * it is injected rather than imported: core reads no environment.
   */
  cookieOptions: CookieOptions;
  /** `NODE_ENV !== 'production'` at the call site. */
  simulateLatency?: boolean;
  /**
   * Required only if a procedure asks for `signed: true` (three cookies in the
   * GSC OAuth flow). Absent, `setCookie` throws rather than quietly emitting an
   * unsigned cookie the callback would reject.
   */
  signCookie?: (value: string) => string;
  /** `DEMO_USER_ID` is set at the call site. Defaults to off. */
  demoMode?: boolean;
}

/**
 * Builds the tRPC context from the request-scoped `HttpCtx`.
 *
 * Cookies go out through the fetch adapter's `resHeaders`, not through Elysia:
 * the handler returns a `Response` the framework did not build, so the cookie
 * proxy is not a guaranteed path out (ADR-009 constraint 1).
 */
export async function makeTrpcContext(
  ctx: HttpCtx,
  resHeaders: Headers,
  options: TrpcContextOptions
): Promise<TrpcContext> {
  if (options.simulateLatency) {
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

  const setCookie = (
    name: string,
    value: string,
    cookie: CookieOptions = {}
  ): void => {
    // V1's precedence, exactly: only `maxAge` and `signed` are caller-
    // controlled, everything else comes from COOKIE_OPTIONS spread last.
    const merged: CookieOptions = {
      maxAge: cookie.maxAge,
      signed: cookie.signed,
      ...options.cookieOptions,
    };

    if (merged.signed && !options.signCookie) {
      throw new Error(
        `Cookie '${name}' asked to be signed but no signCookie was provided`
      );
    }

    resHeaders.append(
      'set-cookie',
      serializeCookie(
        name,
        merged.signed && options.signCookie ? options.signCookie(value) : value,
        merged
      )
    );
  };

  // FLAT, not prototype-chained onto the HttpCtx. tRPC merges middleware
  // context with `{...ctx, ...next.ctx}`, which copies own enumerable
  // properties only — so an inherited `logger`/`db`/`queues` disappears the
  // first time a middleware calls `next({ ctx })`, and the next read of it is
  // a TypeError in the middle of a mutation. Descriptors are COPIED rather
  // than values read, so `services` stays a getter here; tRPC's own spread is
  // what eventually forces it, and only on the RPC path.
  const trpcCtx = flattenCtx(ctx) as unknown as TrpcContext;
  Object.defineProperties(trpcCtx, {
    // Resolved once here, shadowing HttpCtx's resolver. One HTTP request is
    // one `createContext` call, so a batched request still costs one lookup.
    // `HttpCtx.session()` answers `null` for "nobody is signed in" (see
    // http/session.ts); V1's routers read `ctx.session.userId`, so the empty
    // shape — not `null` — is what a procedure must see.
    session: {
      value: (await ctx.session()) ?? EMPTY_SESSION,
      enumerable: true,
    },
    // The fetch adapter is handed a `Request`, which carries no peer address.
    // Elysia's `server.requestIP()` is the source when the dashboard scope
    // mounts; until then the limiter falls back to its shared bucket.
    remoteAddress: { value: undefined, enumerable: true },
    demoMode: { value: options.demoMode ?? false, enumerable: true },
    setCookie: { value: setCookie, enumerable: true },
  });
  return trpcCtx;
}

/** Own + inherited property descriptors, own-first, on one flat object. */
function flattenCtx(ctx: HttpCtx): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  let source: object | null = ctx;
  while (source && source !== Object.prototype) {
    for (const [key, descriptor] of Object.entries(
      Object.getOwnPropertyDescriptors(source)
    )) {
      if (!Object.hasOwn(flat, key)) {
        Object.defineProperty(flat, key, descriptor);
      }
    }
    source = Object.getPrototypeOf(source);
  }
  return flat;
}

/** The subset of the Redis cache the RPC layer uses. */
export interface RpcCache {
  getJson<T = unknown>(key: string): Promise<T | null>;
  setJson<T = unknown>(
    key: string,
    expireInSec: number,
    value: T
  ): Promise<unknown>;
}

export interface CacheMiddlewareDeps {
  cache: RpcCache;
  /**
   * V1 wrote the cache everywhere but only *served* from it in production
   * (`NODE_ENV === 'production'`), so a developer never debugged a stale
   * answer. Preserved as a flag — a thunk because V1 read the env on every
   * request, not once when the router module loaded.
   */
  serveFromCache: boolean | (() => boolean);
}

const middlewareMarker = 'middlewareMarker' as 'middlewareMarker' & {
  __brand: 'middlewareMarker';
};

/**
 * Query response caching, keyed by procedure path and raw input.
 *
 * A factory over the injected cache rather than a module singleton reaching for
 * `getRedisCache()`: the client is built once in main.ts and handed down, so a
 * test passes a map and a second process does not open a connection it never
 * uses.
 */
export const createCacheMiddleware =
  ({ cache, serveFromCache }: CacheMiddlewareDeps) =>
  (cbOrTtl: number | ((input: any, opts: { path: string }) => number)) =>
    t.middleware(async ({ ctx, next, path, type, getRawInput, input }) => {
      const ttl =
        typeof cbOrTtl === 'function' ? cbOrTtl(input, { path }) : cbOrTtl;
      if (!ttl) {
        return next();
      }
      const rawInput = await getRawInput();
      if (type !== 'query') {
        return next();
      }
      let key = `trpc:${path}:`;
      if (rawInput) {
        key += JSON.stringify(rawInput).replace(/"/g, "'");
      }
      const cached = await cache.getJson(key);
      const serve =
        typeof serveFromCache === 'function'
          ? serveFromCache()
          : serveFromCache;
      if (cached && serve) {
        return {
          ok: true,
          data: cached,
          ctx,
          marker: middlewareMarker,
        };
      }
      const result = await next();

      // @ts-expect-error
      if (result.data) {
        cache.setJson(
          key,
          ttl,
          // @ts-expect-error
          result.data
        );
      }
      return result;
    });

export interface RateLimitOptions {
  /** Requests allowed per window before the first block. */
  max: number;
  windowMs: number;
}

/**
 * The limiter itself, injected. It keys on the trusted IP and talks to Redis;
 * both are boot-scope concerns, and injecting it is what lets a procedure be
 * tested without one.
 *
 * The fingerprint is derived from `headers` and `remoteAddress`. `ip` is in the
 * signature because ADR-009 names it, but a limiter must never key on it: it is
 * the attribution address, which prefers client-forwarded headers and would
 * give every request its own bucket (ADR-002 preserved-behaviour 2).
 */
export type EnforceRateLimit = (
  args: RateLimitOptions & {
    headers: Headers;
    ip: string;
    remoteAddress: string | undefined;
    logger: Logger;
    /** tRPC procedure path - blocks are scoped to it. */
    path: string;
  }
) => Promise<void>;

/**
 * Throttle a procedure by client IP, with an exponentially growing lockout for
 * repeat offenders. See the limiter for the escalation rules and for the log
 * line (`rate limit blocked`) that carries the offending IP.
 */
export const createRateLimitMiddleware =
  (enforceRateLimit: EnforceRateLimit) => (options: RateLimitOptions) =>
    t.middleware(async ({ ctx, next, path }) => {
      await enforceRateLimit({
        headers: ctx.headers,
        ip: ctx.ip,
        remoteAddress: ctx.remoteAddress,
        logger: ctx.logger,
        path,
        ...options,
      });
      return next();
    });
