// The per-request plugins: one derive builds `ctx`, one hook logs the request.
//
// `requestContext` is a NAMED plugin, and the name is load-bearing. Elysia
// deduplicates by it, so all 35 modules can start from
// `.use(requestContext(deps))` and the derive still runs exactly once per
// request — one `createCtx`, one child logger, one scoped producer set. The
// corollary is that the first registration wins: every module must be built
// from the same `AppDeps`, which `defineRoutes` and `rest.routes.ts` enforce
// by construction.

import { Elysia } from 'elysia';
import {
  type AppDeps,
  createCtx,
  extendCtx,
  type HttpCtx,
  type Session,
} from '../context';
import { REQUEST_ID_LOG_FIELD } from '../logger';
import type { CookieJar, CookieOptions } from '../shared/cookie';
import { clientIpHook, requestIdHook, timestampHook } from './hooks';
import { resolveSession } from './session';

/** Ported from V1's requestLoggingHook (apps/api/src/hooks/request-logging.hook.ts). */
const UNLOGGED_PATH_PREFIXES = [
  '/healthcheck',
  '/healthz',
  '/metrics',
  '/misc',
];
const UNLOGGED_METHODS = ['OPTIONS'];
const LOGGED_INGEST_HEADERS = [
  'openpanel-client-id',
  'openpanel-sdk-name',
  'openpanel-sdk-version',
];

type ElysiaCookies = Record<
  string,
  { value: unknown; set(config: Record<string, unknown>): unknown }
>;

export function requestContext(deps: AppDeps) {
  return new Elysia({ name: 'core/request-context' })
    .use(requestIdHook())
    .use(timestampHook())
    .use(clientIpHook())
    .derive(
      { as: 'global' },
      ({ request, cookie, requestId, clientIp }): { ctx: HttpCtx } => {
        const logger = deps.logger.child({ [REQUEST_ID_LOG_FIELD]: requestId });
        const cookies = wrapCookies(cookie);
        let session: Promise<Session | null> | undefined;

        return {
          ctx: extendCtx(createCtx(deps, { requestId, logger }), {
            headers: request.headers,
            ip: clientIp,
            cookies,
            session: () =>
              (session ??= resolveSession(deps, cookies, request.headers)),
            setCookie: (name: string, value: string, options?: CookieOptions) =>
              writeCookie(cookie, name, value, options),
          }),
        };
      }
    );
}

export interface RequestLoggingOptions {
  /**
   * V1 read `ENABLE_VERBOSE_LOGGING` here; core reads no environment, so the
   * parsed client-id list arrives from `apps/api`'s config.
   */
  verboseClientIds?: string[];
}

/**
 * V1's `onResponse` requestLoggingHook. One `info` line per request, named
 * `request done` — the `requestId` field rides in from the child logger,
 * replacing V1's `reqId` (ADR-018 R1).
 */
export function requestLogging(
  deps: AppDeps,
  options: RequestLoggingOptions = {}
) {
  const verboseClientIds = new Set(options.verboseClientIds ?? []);

  return new Elysia({ name: 'core/http/request-logging' })
    .use(requestContext(deps))
    .onAfterResponse(
      { as: 'global' },
      ({ ctx, request, path, query, body, timestamp, clientIpHeader }) => {
        if (UNLOGGED_METHODS.includes(request.method)) {
          return;
        }
        if (UNLOGGED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) {
          return;
        }

        const elapsed = Date.now() - timestamp;

        if (path.includes('trpc')) {
          ctx.logger.info(
            {
              url: path,
              method: request.method,
              input: parseTrpcInput(query.input),
              elapsed,
            },
            'request done'
          );
          return;
        }

        const clientId = request.headers.get('openpanel-client-id');
        const verbose = clientId !== null && verboseClientIds.has(clientId);

        ctx.logger.info(
          {
            url: path,
            method: request.method,
            elapsed,
            headers: pickHeaders(request.headers, LOGGED_INGEST_HEADERS),
            // V1 logs the whole /track body here; ADR-018 R6's budget for it
            // is P9's call, not this port's.
            body: path.startsWith('/track') ? body : undefined,
            clientIp: verbose ? ctx.ip : '',
            clientIpHeader: verbose ? clientIpHeader : '',
            userAgent: verbose ? (request.headers.get('user-agent') ?? '') : '',
          },
          'request done'
        );
      }
    );
}

function wrapCookies(cookie: ElysiaCookies): CookieJar {
  return {
    get(name) {
      const value = cookie[name]?.value;
      return typeof value === 'string' ? value : undefined;
    },
  };
}

// `signed` is deliberately not forwarded: Elysia signs by app-level
// `cookie: { secrets, sign: [...] }` config, not per write, so app.ts lists
// the signed names (P3). Everything else maps one-to-one.
function writeCookie(
  cookie: ElysiaCookies,
  name: string,
  value: string,
  options: CookieOptions = {}
): void {
  cookie[name]?.set({
    value,
    maxAge: options.maxAge,
    domain: options.domain,
    path: options.path,
    sameSite: options.sameSite,
    secure: options.secure,
    httpOnly: options.httpOnly,
  });
}

// The dashboard sends the tRPC input as a JSON query param; a batched or
// malformed one is not worth an error inside a logging hook.
function parseTrpcInput(input: string | undefined): unknown {
  if (typeof input !== 'string') {
    return input;
  }
  try {
    return (JSON.parse(input) as { json?: unknown }).json;
  } catch {
    return undefined;
  }
}

function pickHeaders(
  headers: Headers,
  names: string[]
): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const name of names) {
    const value = headers.get(name);
    if (value !== null) {
      picked[name] = value;
    }
  }
  return picked;
}
