// The tRPC mount: the official fetch adapter, one handler, one `onError`
// (ADR-009).
//
// The three `onError` branches are V1's (apps/api/src/app.ts:175-206) with one
// change and no others: the fields come from `ctx` and the `Request`, because
// under a fetch adapter `req` is a `Request` and has neither `socket` nor a
// logger. The messages, the levels, the payload keys and the `organization.list`
// drop are unchanged.

import type { AnyRouter, TRPCError } from '@trpc/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import type { HttpCtx } from '../context';
import type { Logger } from '../logger';
import { getTrustedIpFromHeaders } from '../shared/get-client-ip';
import {
  makeTrpcContext,
  type TrpcContext,
  type TrpcContextOptions,
} from './base';

/**
 * The fetch adapter derives the procedure path with
 * `pathname.slice(endpoint.length)`, and a batched request puts commas in that
 * segment — so the route it mounts on is `.all('/trpc/*')`, not `/trpc/:path`.
 */
export const TRPC_ENDPOINT = '/trpc';

/** The fetch adapter's `onError` argument, structurally. */
export interface TrpcErrorReport {
  error: TRPCError;
  path: string | undefined;
  input: unknown;
  type: 'query' | 'mutation' | 'subscription' | 'unknown';
  ctx: TrpcContext | undefined;
  req: Request;
}

/** Silenced deliberately: the dashboard probes it while signed out. */
const SILENCED_UNAUTHORIZED_PATH = 'organization.list';

/**
 * `bootLogger` is the fallback for when `createContext` itself threw — there is
 * no `ctx` then, and a naive `ctx.logger.error(...)` would turn a
 * context-construction failure into a second throw inside the error handler.
 */
export function createTrpcOnError(bootLogger: Logger) {
  return function onError(report: TrpcErrorReport): void {
    if (
      report.error.code === 'UNAUTHORIZED' &&
      report.path === SILENCED_UNAUTHORIZED_PATH
    ) {
      return;
    }

    // The IP is resolved from trusted headers only (see
    // `getTrustedIpFromHeaders`), so it is the address to hand to
    // Cloudflare when an abuser needs blocking at the edge.
    const { ip, header } = getTrustedIpFromHeaders(report.req.headers);
    const payload = {
      err: report.error,
      path: report.path,
      input: report.input,
      type: report.type,
      session: report.ctx?.session,
      ip,
      ipHeader: header,
      userAgent: report.req.headers.get('user-agent'),
    };

    const logger = report.ctx?.logger ?? bootLogger;

    // Being rate limited is the system working, not an error - logging it
    // as one buried the real errors under 15k lines a day.
    if (report.error.code === 'TOO_MANY_REQUESTS') {
      logger.warn(payload, 'trpc rate limited');
      return;
    }

    logger.error(payload, 'trpc error');
  };
}

export interface TrpcFetchHandlerOptions extends TrpcContextOptions {
  router: AnyRouter;
  /** Used only when `createContext` threw. Every other line goes to `ctx.logger`. */
  logger: Logger;
  endpoint?: string;
}

/**
 * The handler `app.ts` hangs on `.all('/trpc/*')`. It returns a raw `Response`,
 * so `/trpc` sits outside Elysia's response lifecycle — as it sat outside
 * Fastify's in V1.
 */
export function createTrpcFetchHandler(options: TrpcFetchHandlerOptions) {
  const {
    router,
    logger,
    endpoint = TRPC_ENDPOINT,
    ...contextOptions
  } = options;
  const onError = createTrpcOnError(logger);

  return (request: Request, ctx: HttpCtx): Promise<Response> =>
    fetchRequestHandler({
      endpoint,
      req: request,
      router,
      createContext: ({ resHeaders }) =>
        makeTrpcContext(ctx, resHeaders, contextOptions),
      onError,
    });
}
