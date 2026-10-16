import type { AnyRouter, TRPCError } from '@trpc/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import type { IpHeaderConfig } from '../config';
import type { HttpCtx } from '../context';
import type { Logger } from '../logger';
import { getTrustedIpFromHeaders } from '../shared/get-client-ip';
import {
  makeTrpcContext,
  type TrpcContext,
  type TrpcContextOptions,
} from './base';
import { armDeadline, RPC_DEADLINE_MS } from './deadline';

/**
 * The fetch adapter derives the procedure path with
 * `pathname.slice(endpoint.length)` and a batched request puts commas in that
 * segment, so the route is `.all('/trpc/*')`, not `/trpc/:path`.
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
 * A deadline is sent as 504, not tRPC's 408: Chromium silently resends a
 * request that got a 408 on a reused connection, which would run the same
 * too-slow work twice. The body still says `TIMEOUT` / `httpStatus: 408`.
 */
const DEADLINE_HTTP_STATUS = 504;

/**
 * `bootLogger` is the fallback for when `createContext` itself threw: there is
 * no `ctx` then, and `ctx.logger.error(...)` would throw inside the handler.
 */
export function createTrpcOnError(
  bootLogger: Logger,
  ipHeaders: IpHeaderConfig
) {
  return function onError(report: TrpcErrorReport): void {
    if (
      report.error.code === 'UNAUTHORIZED' &&
      report.path === SILENCED_UNAUTHORIZED_PATH
    ) {
      return;
    }

    // Trusted headers only, so this is the address to block at the edge.
    const { ip, header } = getTrustedIpFromHeaders(
      ipHeaders,
      report.req.headers
    );
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

    // Being rate limited is the system working, not an error.
    if (report.error.code === 'TOO_MANY_REQUESTS') {
      logger.warn(payload, 'trpc rate limited');
      return;
    }

    // Nobody is listening for the answer; the request was abandoned, not failed.
    if (report.error.code === 'CLIENT_CLOSED_REQUEST') {
      logger.warn(payload, 'trpc request abandoned');
      return;
    }

    logger.error(payload, 'trpc error');
  };
}

export interface TrpcFetchHandlerOptions extends TrpcContextOptions {
  router: AnyRouter;
  logger: Logger;
  ipHeaders: IpHeaderConfig;
  endpoint?: string;
  deadlineMs?: number;
}

/** Returns a raw `Response`, so `/trpc` sits outside Elysia's response lifecycle. */
export function createTrpcFetchHandler(options: TrpcFetchHandlerOptions) {
  const {
    router,
    logger,
    ipHeaders,
    endpoint = TRPC_ENDPOINT,
    deadlineMs = RPC_DEADLINE_MS,
    ...contextOptions
  } = options;
  const onError = createTrpcOnError(logger, ipHeaders);

  return async (request: Request, ctx: HttpCtx): Promise<Response> => {
    const disarmDeadline = ctx.cancellation
      ? armDeadline(ctx.cancellation, deadlineMs)
      : undefined;
    try {
      return await fetchRequestHandler({
        endpoint,
        req: request,
        router,
        createContext: ({ resHeaders }) =>
          makeTrpcContext(ctx, resHeaders, contextOptions),
        onError,
        responseMeta: ({ errors }) =>
          errors.some((error) => error.code === 'TIMEOUT')
            ? { status: DEADLINE_HTTP_STATUS }
            : {},
      });
    } finally {
      disarmDeadline?.();
    }
  };
}
