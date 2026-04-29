import { z } from 'zod';

import {
  createPersonalAccessToken,
  deletePersonalAccessToken,
  listPersonalAccessTokens,
} from '@openpanel/db';
import { getOrganizationAccess } from '../access';
import { TRPCAccessError } from '../errors';
import { createTRPCRouter, protectedProcedure } from '../trpc';

export const patRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input, ctx }) => {
      return listPersonalAccessTokens({
        userId: ctx.session.userId,
        organizationId: input.organizationId,
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        organizationId: z.string(),
        expiresAt: z.coerce.date().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const access = await getOrganizationAccess({
        userId: ctx.session.userId,
        organizationId: input.organizationId,
      });
      if (!access) throw TRPCAccessError('organization');

      return createPersonalAccessToken({
        name: input.name,
        userId: ctx.session.userId,
        organizationId: input.organizationId,
        expiresAt: input.expiresAt,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await deletePersonalAccessToken({
        id: input.id,
        userId: ctx.session.userId,
      });
    }),
});
