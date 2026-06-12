import { getSubscriptionState } from '@openpanel/payments/subscription-state';
import { PrismaClient } from './generated/prisma/client';

export * from './generated/prisma/client';

const subscriptionStateNeeds = {
  subscriptionStatus: true,
  subscriptionCanceledAt: true,
  subscriptionEndsAt: true,
} as const;

const getPrismaClient = () => {
  const prisma = new PrismaClient({
    log: ['error'],
  }).$extends({
    result: {
      organization: {
        subscriptionState: {
          needs: subscriptionStateNeeds,
          compute(org) {
            return getSubscriptionState(org);
          },
        },
        subscriptionStatus: {
          needs: { subscriptionStatus: true, subscriptionCanceledAt: true },
          compute(org) {
            if (process.env.SELF_HOSTED === 'true') {
              return 'active';
            }

            return org.subscriptionStatus || 'trialing';
          },
        },
        hasSubscription: {
          needs: subscriptionStateNeeds,
          compute(org) {
            const state = getSubscriptionState(org);
            return (
              state === 'active' ||
              state === 'canceling' ||
              state === 'past_due' ||
              state === 'unpaid' ||
              state === 'incomplete'
            );
          },
        },
        slug: {
          needs: { id: true },
          compute(org) {
            return org.id;
          },
        },
        subscriptionChartEndDate: {
          needs: {
            subscriptionEndsAt: true,
            subscriptionPeriodEventsCountExceededAt: true,
          },
          compute(org) {
            if (process.env.SELF_HOSTED === 'true') {
              return null;
            }

            if (
              org.subscriptionEndsAt &&
              org.subscriptionPeriodEventsCountExceededAt
            ) {
              return org.subscriptionEndsAt >
                org.subscriptionPeriodEventsCountExceededAt
                ? org.subscriptionPeriodEventsCountExceededAt
                : org.subscriptionEndsAt;
            }

            if (org.subscriptionEndsAt) {
              return org.subscriptionEndsAt;
            }

            // Hedge against edge cases :D
            return new Date(Date.now() + 1000 * 60 * 60 * 24);
          },
        },
        isActive: {
          needs: subscriptionStateNeeds,
          compute(org) {
            const state = getSubscriptionState(org);
            return state === 'active' || state === 'self_hosted';
          },
        },
        isTrial: {
          needs: subscriptionStateNeeds,
          compute(org) {
            return getSubscriptionState(org) === 'trialing';
          },
        },
        isCanceled: {
          needs: subscriptionStateNeeds,
          compute(org) {
            return getSubscriptionState(org) === 'canceled';
          },
        },
        isWillBeCanceled: {
          needs: subscriptionStateNeeds,
          compute(org) {
            return getSubscriptionState(org) === 'canceling';
          },
        },
        isExpired: {
          needs: subscriptionStateNeeds,
          compute(org) {
            const state = getSubscriptionState(org);
            return state === 'expired' || state === 'trial_expired';
          },
        },
        isExceeded: {
          needs: {
            subscriptionPeriodEventsCount: true,
            subscriptionPeriodEventsLimit: true,
          },
          compute(org) {
            if (process.env.SELF_HOSTED === 'true') {
              return false;
            }

            return (
              org.subscriptionPeriodEventsCount >
              org.subscriptionPeriodEventsLimit
            );
          },
        },
        subscriptionCurrentPeriodStart: {
          needs: { subscriptionStartsAt: true, subscriptionInterval: true },
          compute(org) {
            if (process.env.SELF_HOSTED === 'true') {
              return null;
            }

            if (!org.subscriptionStartsAt) {
              return null;
            }

            if (org.subscriptionInterval === 'year') {
              const startDay = org.subscriptionStartsAt.getUTCDate();
              const now = new Date();
              return new Date(
                Date.UTC(
                  now.getUTCFullYear(),
                  now.getUTCMonth(),
                  startDay,
                  0,
                  0,
                  0,
                  0
                )
              );
            }

            return org.subscriptionStartsAt;
          },
        },
        subscriptionCurrentPeriodEnd: {
          needs: {
            subscriptionStartsAt: true,
            subscriptionEndsAt: true,
            subscriptionInterval: true,
          },
          compute(org) {
            if (process.env.SELF_HOSTED === 'true') {
              return null;
            }

            if (!org.subscriptionStartsAt) {
              return null;
            }

            if (org.subscriptionInterval === 'year') {
              const startDay = org.subscriptionStartsAt.getUTCDate();
              const now = new Date();
              return new Date(
                Date.UTC(
                  now.getUTCFullYear(),
                  now.getUTCMonth() + 1,
                  startDay - 1,
                  0,
                  0,
                  0,
                  0
                )
              );
            }

            return org.subscriptionEndsAt;
          },
        },
      },
    },
  });

  return prisma;
};

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof getPrismaClient>;
};

export const db = globalForPrisma.prisma ?? getPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}
