import { db, getOrganizationEventsCountSerie } from '@openpanel/db';
import { polar } from '@openpanel/payments';
import { zCheckout } from '@openpanel/validation';

import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../trpc';

export const subscriptionRouter = createTRPCRouter({
  checkout: protectedProcedure
    .input(zCheckout)
    .mutation(async ({ input, ctx }) => {
      const user = await db.user.findFirstOrThrow({
        where: {
          id: ctx.session.user.id,
        },
      });

      const checkout = await polar.checkouts.custom.create({
        productPriceId: input.productPriceId,
        successUrl: input.projectId
          ? `${process.env.NEXT_PUBLIC_DASHBOARD_URL}/${input.organizationId}/${input.projectId}/settings`
          : `${process.env.NEXT_PUBLIC_DASHBOARD_URL}/${input.organizationId}/settings`,
        customerEmail: ctx.session.user.email,
        customerName: [user.firstName, user.lastName].filter(Boolean).join(' '),
        customerIpAddress: ctx.req.ip,
        metadata: {
          organizationId: input.organizationId,
          userId: ctx.session.user.id,
        },
      });

      return {
        url: checkout.url,
      };
    }),

  getCheckout: protectedProcedure
    .input(z.object({ checkoutId: z.string() }))
    .query(async ({ input }) => {
      const checkout = await polar.checkouts.custom.get({
        id: input.checkoutId,
      });

      return {
        status: checkout.status,
      };
    }),

  products: protectedProcedure.query(async () => {
    const products = await polar.products.list({
      sorting: ['price_amount'],
      limit: 100,
    });
    return products.result.items;
  }),

  usage: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const organization = await db.organization.findUniqueOrThrow({
        where: {
          id: input.organizationId,
        },
        include: {
          projects: true,
        },
      });

      return getOrganizationEventsCountSerie(organization);
    }),
});
