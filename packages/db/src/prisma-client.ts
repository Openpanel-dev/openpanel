import { createLogger } from '@openpanel/logger';
import { type Organization, PrismaClient } from '@prisma/client';
import { readReplicas } from '@prisma/extension-read-replicas';

export * from '@prisma/client';

const logger = createLogger({ name: 'db' });

const isWillBeCanceled = (
  organization: Pick<
    Organization,
    'subscriptionStatus' | 'subscriptionCanceledAt' | 'subscriptionEndsAt'
  >,
) =>
  organization.subscriptionStatus === 'active' &&
  organization.subscriptionCanceledAt &&
  organization.subscriptionEndsAt;

const isCanceled = (
  organization: Pick<
    Organization,
    'subscriptionStatus' | 'subscriptionCanceledAt'
  >,
) =>
  organization.subscriptionStatus === 'canceled' &&
  organization.subscriptionCanceledAt &&
  organization.subscriptionCanceledAt < new Date();

const getPrismaClient = () => {
  const prisma = new PrismaClient({
    log: ['error'],
  })
    .$extends(
      readReplicas({
        url: process.env.DATABASE_URL_REPLICA ?? process.env.DATABASE_URL!,
      }),
    )
    .$extends({
      query: {
        async $allOperations({ operation, model, args, query }) {
          if (
            operation === 'create' ||
            operation === 'update' ||
            operation === 'delete'
          ) {
            logger.info('Prisma operation', {
              operation,
              args,
              model,
            });
          }
          return query(args);
        },
      },
    })
    .$extends({
      result: {
        organization: {
          subscriptionStatus: {
            needs: { subscriptionStatus: true, subscriptionCanceledAt: true },
            compute(org) {
              if (process.env.NEXT_PUBLIC_SELF_HOSTED === 'true') {
                return 'active';
              }

              return org.subscriptionStatus || 'trialing';
            },
          },
          hasSubscription: {
            needs: { subscriptionStatus: true, subscriptionEndsAt: true },
            compute(org) {
              if (process.env.NEXT_PUBLIC_SELF_HOSTED === 'true') {
                return false;
              }

              if (
                [null, 'canceled', 'trialing'].includes(org.subscriptionStatus)
              ) {
                return false;
              }

              return true;
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
              if (process.env.NEXT_PUBLIC_SELF_HOSTED === 'true') {
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
          isTrial: {
            needs: { subscriptionStatus: true, subscriptionEndsAt: true },
            compute(org) {
              const isSubscriptionInFuture =
                org.subscriptionEndsAt && org.subscriptionEndsAt > new Date();
              return (
                (org.subscriptionStatus === 'trialing' ||
                  org.subscriptionStatus === null) &&
                isSubscriptionInFuture
              );
            },
          },
          isCanceled: {
            needs: { subscriptionStatus: true, subscriptionCanceledAt: true },
            compute(org) {
              if (process.env.NEXT_PUBLIC_SELF_HOSTED === 'true') {
                return false;
              }

              return isCanceled(org);
            },
          },
          isWillBeCanceled: {
            needs: {
              subscriptionStatus: true,
              subscriptionCanceledAt: true,
              subscriptionEndsAt: true,
            },
            compute(org) {
              if (process.env.NEXT_PUBLIC_SELF_HOSTED === 'true') {
                return false;
              }

              return isWillBeCanceled(org);
            },
          },
          isExpired: {
            needs: {
              subscriptionEndsAt: true,
              subscriptionStatus: true,
              subscriptionCanceledAt: true,
            },
            compute(org) {
              if (process.env.NEXT_PUBLIC_SELF_HOSTED === 'true') {
                return false;
              }

              if (isCanceled(org)) {
                return false;
              }

              if (isWillBeCanceled(org)) {
                return false;
              }

              return (
                org.subscriptionEndsAt && org.subscriptionEndsAt < new Date()
              );
            },
          },
          isExceeded: {
            needs: {
              subscriptionPeriodEventsCount: true,
              subscriptionPeriodEventsLimit: true,
            },
            compute(org) {
              if (process.env.NEXT_PUBLIC_SELF_HOSTED === 'true') {
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
              if (process.env.NEXT_PUBLIC_SELF_HOSTED === 'true') {
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
                    0,
                  ),
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
              if (process.env.NEXT_PUBLIC_SELF_HOSTED === 'true') {
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
                    0,
                  ),
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
