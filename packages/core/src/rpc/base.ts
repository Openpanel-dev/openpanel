// The tRPC instance, its context, and the middleware factories procedures are
// built from (ADR-009).
//
// The tRPC context IS the Elysia-derived `HttpCtx`: `makeTrpcContext` adds the
// tRPC-specific bits and overrides exactly one field. There is no `req`/`res`
// here — a procedure reads `ctx.headers`, `ctx.ip`, `ctx.logger`.
//
// `transformer`, `errorFormatter` and `Meta` are verbatim from
// packages/trpc/src/trpc.ts:44-67; error semantics are unchanged by decision.

import { initTRPC } from '@trpc/server';
import superjson from 'superjson';
import { ZodError, z } from 'zod';
import type { HttpCtx, Session } from '../context';
import type { Logger } from '../logger';
import { type CookieOptions, serializeCookie } from '../shared/cookie';

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

/** What tRPC procedures see. Everything except `resolvedSession` is `HttpCtx`. */
export interface TrpcContext extends HttpCtx {
  /**
   * The session if `session()` has already resolved, `undefined` otherwise.
   * `onError` logs it and cannot await, which is the only reason this exists.
   */
  readonly resolvedSession: Session | null | undefined;
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
 * The bare procedure. V1's `publicProcedure` / `protectedProcedure` /
 * `protectedProcedureWithoutAccess` compose this with the logger, sessionScope,
 * `enforceUserIsAuthed` and `enforceAccess` middlewares; those need the
 * resolved `Session` shape and the access rules, so they land with auth (P6).
 */
export const procedure = t.procedure;

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

  let resolvedSession: Session | null | undefined;

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

  // Prototype-chained onto the HttpCtx, never spread: `{ ...ctx }` reads
  // `services` and forces the build the lazy getter exists to avoid.
  // defineProperties, not Object.assign, because `resolvedSession` is an
  // accessor and Object.assign would copy its value once.
  const trpcCtx = Object.create(ctx) as TrpcContext;
  Object.defineProperties(trpcCtx, {
    session: {
      value: async (): Promise<Session | null> => {
        resolvedSession = await ctx.session();
        return resolvedSession;
      },
      enumerable: true,
    },
    resolvedSession: {
      get: () => resolvedSession,
      enumerable: true,
    },
    setCookie: { value: setCookie, enumerable: true },
  });
  return trpcCtx;
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
   * answer. Preserved as a flag.
   */
  serveFromCache: boolean;
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
      if (cached && serveFromCache) {
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
 */
export type EnforceRateLimit = (
  args: RateLimitOptions & {
    headers: Headers;
    ip: string;
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
        logger: ctx.logger,
        path,
        ...options,
      });
      return next();
    });
