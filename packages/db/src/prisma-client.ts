import { createLogger } from '@openpanel/logger';
import { PrismaClient } from '@prisma/client';
import { readReplicas } from '@prisma/extension-read-replicas';

export * from '@prisma/client';

const logger = createLogger({ name: 'db' });

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
            needs: { subscriptionStatus: true },
            compute(org) {
              return org.subscriptionStatus || 'trial';
            },
          },
          slug: {
            needs: { id: true },
            compute(org) {
              return org.id;
            },
          },
          isTrial: {
            needs: { subscriptionStatus: true, subscriptionEndsAt: true },
            compute(org) {
              const isSubscriptionInFuture =
                org.subscriptionEndsAt && org.subscriptionEndsAt > new Date();
              return (
                org.subscriptionStatus === 'trial' && isSubscriptionInFuture
              );
            },
          },
          isExpired: {
            needs: { subscriptionEndsAt: true },
            compute(org) {
              const isSubscriptionInFuture =
                org.subscriptionEndsAt && org.subscriptionEndsAt > new Date();
              return !isSubscriptionInFuture && org.subscriptionEndsAt;
            },
          },
          isExceeded: {
            needs: {
              subscriptionPeriodEventsCount: true,
              subscriptionPeriodLimit: true,
            },
            compute(org) {
              return (
                org.subscriptionPeriodEventsCount > org.subscriptionPeriodLimit
              );
            },
          },
          subscriptionCurrentPeriodStart: {
            needs: { subscriptionStartsAt: true, subscriptionInterval: true },
            compute(org) {
              if (!org.subscriptionStartsAt) return org.subscriptionStartsAt;

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
              if (!org.subscriptionStartsAt) return org.subscriptionEndsAt;

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
};

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof getPrismaClient>;
};

export const db = globalForPrisma.prisma ?? getPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}
