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
    });

  return prisma;
};

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof getPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? getPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
