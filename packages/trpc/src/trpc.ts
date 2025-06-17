import { TRPCError, initTRPC } from '@trpc/server';
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { has } from 'ramda';
import superjson from 'superjson';
import { ZodError } from 'zod';

import { COOKIE_OPTIONS, validateSessionToken } from '@openpanel/auth';
import { getRedisCache } from '@openpanel/redis';
import type { ISetCookie } from '@openpanel/validation';
import {
  createTrpcRedisLimiter,
  defaultFingerPrint,
} from '@trpc-limiter/redis';
import { getOrganizationAccessCached, getProjectAccessCached } from './access';
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
  const setCookie: ISetCookie = (key, value, options) => {
    // @ts-ignore
    res.setCookie(key, value, {
      maxAge: options.maxAge,
      ...COOKIE_OPTIONS,
    });
  };

  // @ts-ignore
  const session = await validateSessionToken(req.cookies?.session);

  return {
    req,
    res,
    session,
    // we do not get types for `setCookie` from fastify
    // so define it here and be safe in routers
    setCookie,
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
const enforceAccess = t.middleware(async ({ ctx, next, rawInput, type }) => {
  if (type === 'mutation' && process.env.DEMO_USER_ID) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You are not allowed to do this in demo mode',
    });
  }

  if (has('projectId', rawInput)) {
    const access = await getProjectAccessCached({
      userId: ctx.session.userId!,
      projectId: rawInput.projectId as string,
    });

    if (!access) {
      throw TRPCAccessError('You do not have access to this project');
    }
  }

  if (has('organizationId', rawInput)) {
    const access = await getOrganizationAccessCached({
      userId: ctx.session.userId!,
      organizationId: rawInput.organizationId as string,
    });

    if (!access) {
      throw TRPCAccessError('You do not have access to this organization');
    }
  }

  return next();
});

export const createTRPCRouter = t.router;

const loggerMiddleware = t.middleware(
  async ({ ctx, next, rawInput, path, input, type }) => {
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

export const publicProcedure = t.procedure.use(loggerMiddleware);
export const protectedProcedure = t.procedure
  .use(enforceUserIsAuthed)
  .use(enforceAccess)
  .use(loggerMiddleware);

const middlewareMarker = 'middlewareMarker' as 'middlewareMarker' & {
  __brand: 'middlewareMarker';
};

export const cacheMiddleware = (cbOrTtl: number | ((input: any) => number)) =>
  t.middleware(async ({ ctx, next, path, type, rawInput, input }) => {
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
        typeof cbOrTtl === 'function' ? cbOrTtl(input) : cbOrTtl,
        // @ts-expect-error
        result.data,
      );
    }
    return result;
  });
