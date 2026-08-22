import {
  db,
  getOrganizationAccess,
  getOrganizationBillingEventsCountSerieCached,
  getOrganizationById,
} from '@openpanel/db';
import {
  applySubscriptionDiscount,
  cancelSubscription,
  changeSubscription,
  createCheckout,
  createPortal,
  getProduct,
  getProducts,
  pauseSubscription,
  reactivateSubscription,
  resumeSubscription,
  unpauseSubscription,
} from '@openpanel/payments';
import {
  zCancelSubscription,
  zCheckout,
  zPauseSubscription,
} from '@openpanel/validation';

import { getCache } from '@openpanel/redis';
import { addMonths, subDays } from 'date-fns';
import { z } from 'zod';
import { TRPCForbiddenError, TRPCBadRequestError } from '../errors';
import { createTRPCRouter, protectedProcedure } from '../trpc';

async function requireAdmin(userId: string, organizationId: string) {
  const access = await getOrganizationAccess({ userId, organizationId });
  if (access?.role !== 'org:admin') {
    throw new TRPCForbiddenError('Only organization admins can manage billing');
  }
}

export const subscriptionRouter = createTRPCRouter({
  getCurrent: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      const organization = await getOrganizationById(input.organizationId);

      if (!organization.subscriptionProductId) {
        return null;
      }

      return getProduct(organization.subscriptionProductId);
    }),

  checkout: protectedProcedure
    .input(zCheckout)
    .mutation(async ({ input, ctx }) => {
      await requireAdmin(ctx.session.userId, input.organizationId);
      const [user, organization] = await Promise.all([
        db.user.findFirstOrThrow({
          where: {
            id: ctx.session.user.id,
          },
        }),
        db.organization.findFirstOrThrow({
          where: {
            id: input.organizationId,
          },
        }),
      ]);

      // A paused subscription still exists in Polar — a checkout here would
      // create a second one. Resume first, then change plans.
      if (
        organization.subscriptionId &&
        organization.subscriptionStatus === 'paused'
      ) {
        throw new TRPCBadRequestError(
          'Your subscription is paused — resume it before changing plans',
        );
      }

      // An organization has at most one Polar subscription (we have no free
      // tier in Polar — the free plan is handled on our side). So an upgrade or
      // downgrade is an in-place product change, never a cancel + re-subscribe.
      // Reactivate first if it was scheduled to cancel, otherwise change the
      // product on the existing subscription.
      if (
        organization.subscriptionId &&
        organization.subscriptionStatus === 'active'
      ) {
        if (organization.subscriptionCanceledAt) {
          await reactivateSubscription(organization.subscriptionId);
          return null;
        }

        // Already on this product — nothing to change.
        if (organization.subscriptionProductId === input.productId) {
          return null;
        }

        await changeSubscription(organization.subscriptionId, input.productId);
        return null;
      }

      const checkout = await createCheckout({
        productId: input.productId,
        organizationId: input.organizationId,
        user,
        ipAddress: ctx.req.ip,
      });

      return {
        url: checkout.url,
      };
    }),

  products: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      const organization = await db.organization.findUniqueOrThrow({
        where: {
          id: input.organizationId,
        },
        select: {
          subscriptionPeriodEventsCount: true,
        },
      });

      return (
        await getCache('polar:products', 60 * 60 * 24, () => getProducts())
      ).map((product) => {
        const eventsLimit = product.metadata.eventsLimit;
        return {
          ...product,
          disabled:
            typeof eventsLimit === 'number' &&
            organization.subscriptionPeriodEventsCount >= eventsLimit
              ? 'This product is not applicable since you have exceeded the limits for this subscription.'
              : null,
        };
      });
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
          projects: { select: { id: true } },
        },
      });

      if (
        organization.hasSubscription &&
        organization.subscriptionStartsAt &&
        organization.subscriptionEndsAt
      ) {
        return getOrganizationBillingEventsCountSerieCached(organization, {
          startDate: organization.subscriptionStartsAt,
          endDate: organization.subscriptionEndsAt,
        });
      }

      return getOrganizationBillingEventsCountSerieCached(organization, {
        startDate: subDays(new Date(), 30),
        endDate: new Date(),
      });
    }),

  cancelSubscription: protectedProcedure
    .input(zCancelSubscription)
    .mutation(async ({ input, ctx }) => {
      await requireAdmin(ctx.session.userId, input.organizationId);
      const organization = await getOrganizationById(input.organizationId);
      if (!organization.subscriptionId) {
        throw new TRPCBadRequestError('Organization has no subscription');
      }

      const res = await cancelSubscription(organization.subscriptionId, {
        reason: input.reason,
        comment: input.comment,
      });

      // The webhook echoes these back, but persist immediately so the reason
      // is never lost to a missed/delayed webhook delivery.
      await db.organization.update({
        where: { id: input.organizationId },
        data: {
          subscriptionCancelReason: input.reason,
          subscriptionCancelComment: input.comment ?? null,
        },
      });

      return res;
    }),

  pauseSubscription: protectedProcedure
    .input(zPauseSubscription)
    .mutation(async ({ input, ctx }) => {
      await requireAdmin(ctx.session.userId, input.organizationId);
      const organization = await getOrganizationById(input.organizationId);
      if (!organization.subscriptionId) {
        throw new TRPCBadRequestError('Organization has no subscription');
      }
      if (!organization.subscriptionEndsAt) {
        throw new TRPCBadRequestError('Subscription has no current period end');
      }

      // Polar pauses at period end; the resume date counts from there.
      const resumesAt = addMonths(
        organization.subscriptionEndsAt,
        input.months,
      );

      await pauseSubscription(organization.subscriptionId, resumesAt);

      // Optimistic mirror — the subscription.updated webhook confirms it.
      await db.organization.update({
        where: { id: input.organizationId },
        data: {
          subscriptionPauseAtPeriodEnd: true,
          subscriptionResumesAt: resumesAt,
        },
      });

      return { resumesAt };
    }),

  resumeSubscription: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await requireAdmin(ctx.session.userId, input.organizationId);
      const organization = await getOrganizationById(input.organizationId);
      if (!organization.subscriptionId) {
        throw new TRPCBadRequestError('Organization has no subscription');
      }

      if (organization.subscriptionStatus === 'paused') {
        // Already paused — resuming starts a new billing period immediately.
        await resumeSubscription(organization.subscriptionId);
      } else if (organization.subscriptionPauseAtPeriodEnd) {
        // Pause is only scheduled — just clear it.
        await unpauseSubscription(organization.subscriptionId);
      } else {
        throw new TRPCBadRequestError('Subscription is not paused');
      }

      await db.organization.update({
        where: { id: input.organizationId },
        data: {
          subscriptionPauseAtPeriodEnd: false,
          subscriptionResumesAt: null,
        },
      });

      return { success: true };
    }),

  applySaveDiscount: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await requireAdmin(ctx.session.userId, input.organizationId);
      const discountId = process.env.POLAR_SAVE_DISCOUNT_ID;
      if (!discountId) {
        throw new TRPCBadRequestError('Save discount is not configured');
      }

      const organization = await getOrganizationById(input.organizationId);
      if (!organization.subscriptionId) {
        throw new TRPCBadRequestError('Organization has no subscription');
      }
      if (organization.subscriptionSaveDiscountAppliedAt) {
        throw new TRPCBadRequestError(
          'The save discount has already been used',
        );
      }

      await applySubscriptionDiscount(organization.subscriptionId, discountId);

      await db.organization.update({
        where: { id: input.organizationId },
        data: {
          subscriptionSaveDiscountAppliedAt: new Date(),
        },
      });

      return { success: true };
    }),

  portal: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await requireAdmin(ctx.session.userId, input.organizationId);
      const organization = await getOrganizationById(input.organizationId);
      if (!organization.subscriptionCustomerId) {
        throw new TRPCBadRequestError('Organization has no subscription');
      }

      const portal = await createPortal({
        customerId: organization.subscriptionCustomerId,
      });

      return {
        url: portal.customerPortalUrl,
      };
    }),
});
