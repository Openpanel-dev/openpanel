import { getAuth } from '@clerk/fastify';
import { TRPCError, initTRPC } from '@trpc/server';
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { has } from 'ramda';
import superjson from 'superjson';
import { ZodError } from 'zod';

import { getOrganizationAccessCached, getProjectAccessCached } from './access';
import { TRPCAccessError } from './errors';

export function createContext({ req, res }: CreateFastifyContextOptions) {
  return {
    req,
    res,
    session: getAuth(req),
    // we do not get types for `setCookie` from fastify
    // so define it here and be safe in routers
    setCookie: (
      key: string,
      value: string,
      options: {
        maxAge: number;
        path: string;
      },
    ) => {
      // @ts-ignore
      res.setCookie(key, value, options);
    },
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
const enforceAccess = t.middleware(async ({ ctx, next, rawInput }) => {
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

  if (has('organizationSlug', rawInput)) {
    const access = await getOrganizationAccessCached({
      userId: ctx.session.userId!,
      organizationId: rawInput.organizationSlug as string,
    });

    if (!access) {
      throw TRPCAccessError('You do not have access to this organization');
    }
  }

  return next();
});

export const createTRPCRouter = t.router;

export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure
  .use(enforceUserIsAuthed)
  .use(enforceAccess);
