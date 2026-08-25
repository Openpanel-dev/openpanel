import crypto from 'node:crypto';
import { z } from 'zod';

import type { Prisma } from '@openpanel/db';
import { db } from '@openpanel/db';

import { hashPassword } from '@openpanel/common/server';
import { getClientAccess, requireOrganizationAdmin } from '../access';
import { TRPCForbiddenError } from '../errors';
import { createTRPCRouter, protectedProcedure } from '../trpc';

export const clientRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      return db.client.findMany({
        where: {
          projectId: input.projectId,
        },
      });
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const access = await getClientAccess({
        userId: ctx.session.userId,
        clientId: input.id,
      });

      if (!access) {
        throw new TRPCForbiddenError('You do not have access to this client');
      }

      return db.client.update({
        where: {
          id: input.id,
        },
        data: {
          name: input.name,
        },
      });
    }),
  create: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        projectId: z.string(),
        organizationId: z.string(),
        type: z.enum(['read', 'write', 'root']).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // Minting an ingestion credential - a `root` one at the caller's choosing
      // - is admin-tier, not something any org member should be able to do.
      await requireOrganizationAdmin({
        userId: ctx.session.userId,
        organizationId: input.organizationId,
        message: 'Only organization admins can create API clients',
      });

      const secret = `sec_${crypto.randomBytes(10).toString('hex')}`;
      const data: Prisma.ClientCreateArgs['data'] = {
        organizationId: input.organizationId,
        projectId: input.projectId,
        name: input.name,
        type: input.type ?? 'write',
        secret: await hashPassword(secret),
      };

      const client = await db.client.create({ data });

      return {
        ...client,
        secret,
      };
    }),
  remove: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const client = await db.client.findUnique({
        where: { id: input.id },
        select: { organizationId: true },
      });

      if (!client?.organizationId) {
        throw new TRPCForbiddenError('You do not have access to this client');
      }

      // Revoking a credential breaks ingestion for whoever is using it.
      await requireOrganizationAdmin({
        userId: ctx.session.userId,
        organizationId: client.organizationId,
        message: 'Only organization admins can delete API clients',
      });

      await db.client.delete({
        where: {
          id: input.id,
        },
      });
      return true;
    }),
});
