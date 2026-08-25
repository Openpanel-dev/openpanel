import { TRPCError, initTRPC } from '@trpc/server';
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { has } from 'ramda';
import superjson from 'superjson';
import { ZodError, z } from 'zod';

import { COOKIE_OPTIONS, type SessionValidationResult } from '@openpanel/auth';
import { runWithAlsSession } from '@openpanel/db';
import { getRedisCache } from '@openpanel/redis';
import type { ISetCookie } from '@openpanel/validation';
import {
  createTrpcRedisLimiter,
  defaultFingerPrint,
} from '@trpc-limiter/redis';
import { getOrganizationAccess, requireProjectAccess } from './access';
import { TRPCForbiddenError } from './errors';

export const rateLimitMiddleware = ({
  max,
  windowMs,
}: {
  max: number;
  windowMs: number;
}) =>
  createTrpcRedisLimiter<typeof t>({
    fingerprint: (ctx) => defaultFingerPrint(ctx.req),
    message: (hitInfo) =>
      `Too many requests, please try again later. ${hitInfo}`,
    max,
    windowMs,
    redisClient: getRedisCache(),
  });

export async function createContext({ req, res }: CreateFastifyContextOptions) {
  const cookies = (req as any).cookies as Record<string, string | undefined>;
  const setCookie: ISetCookie = (key, value, options) => {
    // @ts-ignore
    res.setCookie(key, value, {
      maxAge: options.maxAge,
      signed: options.signed,
      ...COOKIE_OPTIONS,
    });
  };

  if (process.env.NODE_ENV !== 'production') {
    await new Promise((res) =>
      setTimeout(() => res(1), Math.min(Math.random() * 500, 200)),
    );
  }

  return {
    req,
    res,
    session: (req as any).session as SessionValidationResult,
    // we do not get types for `setCookie` from fastify
    // so define it here and be safe in routers
    setCookie,
    cookies,
  };
}
export type Context = Awaited<ReturnType<typeof createContext>>;

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

const t = initTRPC.context<Context>().meta<Meta>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? z.flattenError(error.cause) : null,
      },
    };
  },
});

const enforceUserIsAuthed = t.middleware(async ({ ctx, next }) => {
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
const enforceAccess = t.middleware(async ({ ctx, next, type, meta, getRawInput }) => {
  const sessionId = ctx.session?.session?.id ?? null;
  return runWithAlsSession(sessionId, async () => {
    const rawInput = await getRawInput();
    if (type === 'mutation' && process.env.DEMO_USER_ID) {
      throw new TRPCForbiddenError('You are not allowed to do this in demo mode');
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
        throw new TRPCForbiddenError('You do not have access to this organization');
      }
    }

    return next();
  });
});

export const createTRPCRouter = t.router;

const loggerMiddleware = t.middleware(
  async ({ ctx, next, getRawInput, path, input, type }) => {
    const rawInput = await getRawInput();
    // Only log mutations
    if (type === 'mutation') {
      ctx.req.log.info(
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
        'TRPC mutation',
      );
    }
    return next();
  },
);

const sessionScopeMiddleware = t.middleware(async ({ ctx, next }) => {
  const sessionId = ctx.session?.session?.id ?? null;
  return runWithAlsSession(sessionId, async () => {
    return next();
  });
});

export const publicProcedure = t.procedure
  .use(loggerMiddleware)
  .use(sessionScopeMiddleware);
export const protectedProcedure = t.procedure
  .use(enforceUserIsAuthed)
  .use(enforceAccess)
  .use(loggerMiddleware)
  .use(sessionScopeMiddleware);
// Authenticated but WITHOUT the org/project membership check. Use for endpoints
// that must answer for any logged-in user (e.g. checking your own access to an
// org you may not belong to) and return null instead of throwing.
export const protectedProcedureWithoutAccess = t.procedure
  .use(enforceUserIsAuthed)
  .use(loggerMiddleware)
  .use(sessionScopeMiddleware);

const middlewareMarker = 'middlewareMarker' as 'middlewareMarker' & {
  __brand: 'middlewareMarker';
};

export const cacheMiddleware = (
  cbOrTtl: number | ((input: any, opts: { path: string }) => number),
) =>
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
      key += JSON.stringify(rawInput).replace(/\"/g, "'");
    }
    const cache = await getRedisCache().getJson(key);
    if (cache && process.env.NODE_ENV === 'production') {
      return {
        ok: true,
        data: cache,
        ctx,
        marker: middlewareMarker,
      };
    }
    const result = await next();

    // @ts-expect-error
    if (result.data) {
      getRedisCache().setJson(
        key,
        ttl,
        // @ts-expect-error
        result.data,
      );
    }
    return result;
  });
