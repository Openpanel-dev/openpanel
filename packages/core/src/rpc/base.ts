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
   * The connection's peer address — the one address a client cannot forge,
   * and therefore the rate limiter's last-resort fallback when no trusted
   * header is present. It is NOT `ctx.ip`: that is the *attribution* ip,
   * which prefers client-forwarded headers and would give every request its
   * own bucket (ADR-002 "behaviour that must be preserved explicitly" 2).
   *
   * `undefined` where the transport does not expose it. Elysia's
   * `server.requestIP()` is not plumbed through `HttpCtx` yet, so the fetch
   * mount leaves it unset and the limiter falls back to its shared
   * `unknown` bucket — fail-closed, which is the documented intent.
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

  // Prototype-chained onto the HttpCtx, never spread: `{ ...ctx }` reads
  // `services` and forces the build the lazy getter exists to avoid.
  const trpcCtx = Object.create(ctx) as TrpcContext;
  Object.defineProperties(trpcCtx, {
    // Resolved once here, shadowing HttpCtx's resolver. One HTTP request is
    // one `createContext` call, so a batched request still costs one lookup.
    session: { value: await ctx.session(), enumerable: true },
    // The fetch adapter is handed a `Request`, which carries no peer address.
    // Elysia's `server.requestIP()` is the source when the dashboard scope
    // mounts; until then the limiter falls back to its shared bucket.
    remoteAddress: { value: undefined, enumerable: true },
    demoMode: { value: options.demoMode ?? false, enumerable: true },
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
 * The fingerprint is derived from `headers` and `remoteAddress`. `ip` is in
 * the signature because ADR-009 names it, but a limiter must never key on it:
 * it is the attribution address, which prefers client-forwarded headers and
 * would give every request its own bucket (ADR-002 preserved-behaviour 2).
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
