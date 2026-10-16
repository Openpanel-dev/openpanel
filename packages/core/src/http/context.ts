// `requestContext` is a NAMED plugin and the name is load-bearing: Elysia
// deduplicates by it, so every module can start from `.use(requestContext(deps))`
// and the derive still runs once per request. The first registration wins, so
// every module must be built from the same `AppDeps`.

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

const UNLOGGED_PATH_PREFIXES = [
  '/healthcheck',
  '/healthz',
  '/metrics',
  '/misc',
];
const UNLOGGED_METHODS = ['OPTIONS'];
/** A write keeps running to completion without its client. */
const CANCELLABLE_METHODS = new Set(['GET', 'HEAD']);
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
    .use(clientIpHook(deps.config.ipHeaders))
    .derive(
      { as: 'global' },
      ({ request, cookie, requestId, clientIp }): { ctx: HttpCtx } => {
        const logger = deps.logger.child({ [REQUEST_ID_LOG_FIELD]: requestId });
        const cookies = wrapCookies(cookie);
        let session: Promise<Session | null> | undefined;
        const cancellation = CANCELLABLE_METHODS.has(request.method)
          ? cancelOnDisconnect(request.signal)
          : undefined;

        // The resolver is lazy, so closing over the ctx it is installed on is safe.
        const ctx: HttpCtx = extendCtx(
          createCtx(deps, { requestId, logger, signal: cancellation?.signal }),
          {
            headers: request.headers,
            ip: clientIp,
            cookies,
            session: () =>
              (session ??= resolveSession(ctx, cookies, request.headers)),
            setCookie: (name: string, value: string, options?: CookieOptions) =>
              writeCookie(cookie, name, value, options),
            cancellation,
          }
        );

        return { ctx };
      }
    );
}

export interface RequestLoggingOptions {
  verboseClientIds?: string[];
}

/** One `info` line per request, named `request done`. */
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
        // This global hook also runs for a request that matched no route, whose
        // `derive` never ran: no request logger and no arrival timestamp.
        if (!ctx) {
          return;
        }
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

// Bun aborts `request.signal` when the client goes away (disconnect, idle
// timeout, closed websocket) but not after a response.
function cancelOnDisconnect(requestSignal: AbortSignal): AbortController {
  const cancellation = new AbortController();
  requestSignal.addEventListener(
    'abort',
    () => cancellation.abort(requestSignal.reason),
    { once: true, signal: cancellation.signal }
  );
  return cancellation;
}

function wrapCookies(cookie: ElysiaCookies): CookieJar {
  return {
    get(name) {
      const value = cookie[name]?.value;
      return typeof value === 'string' ? value : undefined;
    },
  };
}

// `signed` is not forwarded: Elysia signs by app-level `cookie: { secrets, sign }`
// config, so apps/api/src/main.ts lists the signed names.
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

// A batched or malformed tRPC input is not worth an error inside a logging hook.
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
