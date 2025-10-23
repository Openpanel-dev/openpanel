import { TRPCError, initTRPC } from '@trpc/server';
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { has } from 'ramda';
import superjson from 'superjson';
import { ZodError } from 'zod';

import { COOKIE_OPTIONS, type SessionValidationResult } from '@openpanel/auth';
import { runWithAlsSession } from '@openpanel/db';
import { getRedisCache } from '@openpanel/redis';
import type { ISetCookie } from '@openpanel/validation';
import {
  createTrpcRedisLimiter,
  defaultFingerPrint,
} from '@trpc-limiter/redis';
import { getOrganizationAccess, getProjectAccess } from './access';
import { TRPCAccessError } from './errors';

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

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
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
const enforceAccess = t.middleware(async ({ ctx, next, type, getRawInput }) => {
  return runWithAlsSession(ctx.session.session?.id, async () => {
    const rawInput = await getRawInput();
    if (type === 'mutation' && process.env.DEMO_USER_ID) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'You are not allowed to do this in demo mode',
      });
    }

    if (has('projectId', rawInput)) {
      const access = await getProjectAccess({
        userId: ctx.session.userId!,
        projectId: rawInput.projectId as string,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }
    }

    if (has('organizationId', rawInput)) {
      const access = await getOrganizationAccess({
        userId: ctx.session.userId!,
        organizationId: rawInput.organizationId as string,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this organization');
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
      ctx.req.log.info('TRPC mutation', {
        path,
        rawInput,
        input,
        userId: ctx.session?.userId,
        organizationId: has('organizationId', rawInput)
          ? rawInput.organizationId
          : undefined,
        projectId: has('projectId', rawInput) ? rawInput.projectId : undefined,
      });
    }
    return next();
  },
);

const sessionScopeMiddleware = t.middleware(async ({ ctx, next }) => {
  const sessionId = ctx.session.session?.id ?? null;
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
    if (cache) {
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
