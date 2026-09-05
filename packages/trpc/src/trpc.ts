// The tRPC procedure stack, on @openpanel/core's RPC base (ADR-009).
//
// There is exactly ONE tRPC instance in the repo: `initTRPC` is called in
// core/src/rpc/base.ts and nowhere else, so the transformer, the
// errorFormatter, `Meta` and the context type are single-sourced. M9-004
// deleted the Fastify adapter and its `createContext` with the V1 boot; the
// one mount left is `createTrpcFetchHandler`, called from `main.ts`.
//
// What still lives here is what core cannot import without pulling a database
// into a package that must stay bootable with none: the procedures below need
// `runWithAlsSession` and the access ladder's real lookups. They move into
// core with auth at P10, at which point this file is a re-export.

import {
  createCacheMiddleware,
  createRateLimitMiddleware,
  middleware,
  procedure,
  type RpcCache,
  type TrpcContext,
} from '@openpanel/core';
import { runWithAlsSession } from '@openpanel/core';
import { getRedisCache } from '@openpanel/redis';
import { TRPCError } from '@trpc/server';
import { has } from 'ramda';
import { getOrganizationAccess, requireProjectAccess } from './access';
import { TRPCForbiddenError } from './errors';
import { enforceRateLimit } from './rate-limit';

export type { Meta } from '@openpanel/core';
export { createTRPCRouter } from '@openpanel/core';

/** What a procedure receives. Core's type, not a second declaration. */
export type Context = TrpcContext;

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
