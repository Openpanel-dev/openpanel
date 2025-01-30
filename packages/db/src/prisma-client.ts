import { PrismaClient } from '@prisma/client';
import { readReplicas } from '@prisma/extension-read-replicas';

export * from '@prisma/client';

const getPrismaClient = () => {
  return new PrismaClient({
    log: ['error'],
  }).$extends(
    readReplicas({
      url: process.env.DATABASE_URL_REPLICA ?? process.env.DATABASE_URL!,
    }),
  );
};

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof getPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? getPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
