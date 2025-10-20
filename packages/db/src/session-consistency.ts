import { getRedisCache } from '@openpanel/redis';
import type { Operation } from '@prisma/client/runtime/client';
import { Prisma, type PrismaClient } from './generated/prisma/client';
import { logger } from './logger';
import { getAlsSessionId } from './session-context';

type BarePrismaClient = {
  $queryRaw: <T>(query: TemplateStringsArray, ...args: unknown[]) => Promise<T>;
};

// WAL LSN tracking for read-after-write consistency
const LSN_CACHE_PREFIX = 'db:wal_lsn:';
const LSN_CACHE_TTL = 5;
const MAX_RETRY_ATTEMPTS = 5;
const INITIAL_RETRY_DELAY_MS = 10;

const READ_OPERATIONS: Operation[] = [
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'aggregate',
  'groupBy',
  'count',
];

const WRITE_OPERATIONS: Operation[] = [
  'create',
  'update',
  'delete',
  'createMany',
  'createManyAndReturn',
  'updateMany',
  'deleteMany',
  'upsert',
];

const isWriteOperation = (operation: string) =>
  WRITE_OPERATIONS.includes(operation as Operation);

const isReadOperation = (operation: string) =>
  READ_OPERATIONS.includes(operation as Operation);

async function getCurrentWalLsn(
  prismaClient: BarePrismaClient,
): Promise<string | null> {
  try {
    const result = await prismaClient.$queryRaw<[{ lsn: string }]>`
      SELECT pg_current_wal_lsn()::text AS lsn
    `;
    return result[0]?.lsn || null;
  } catch (error) {
    logger.error('Failed to get WAL LSN', { error });
    return null;
  }
}

async function cacheWalLsnForSession(
  sessionId: string,
  lsn: string,
): Promise<void> {
  try {
    const redis = getRedisCache();
    await redis.setex(`${LSN_CACHE_PREFIX}${sessionId}`, LSN_CACHE_TTL, lsn);
  } catch (error) {
    logger.error('Failed to cache WAL LSN', { error, sessionId });
  }
}

async function getCachedWalLsn(sessionId: string): Promise<string | null> {
  try {
    const redis = getRedisCache();
    return await redis.get(`${LSN_CACHE_PREFIX}${sessionId}`);
  } catch (error) {
    logger.error('Failed to get cached WAL LSN', { error, sessionId });
    return null;
  }
}

function compareWalLsn(lsn1: string, lsn2: string): number {
  const [x1, y1] = lsn1.split('/').map((x) => BigInt(`0x${x}`));
  const [x2, y2] = lsn2.split('/').map((x) => BigInt(`0x${x}`));

  const v1 = ((x1 ?? 0n) << 32n) + (y1 ?? 0n);
  const v2 = ((x2 ?? 0n) << 32n) + (y2 ?? 0n);

  if (v1 < v2) return -1;
  if (v1 > v2) return 1;
  return 0;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForReplicaCatchup(
  prismaClient: BarePrismaClient,
  sessionId: string,
): Promise<boolean> {
  const expectedLsn = await getCachedWalLsn(sessionId);

  if (!expectedLsn) {
    return true;
  }

  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
    const currentLsn = await getCurrentWalLsn(prismaClient);
    if (!currentLsn) {
      return true;
    }

    // Check if replica has caught up (current >= expected)
    if (compareWalLsn(currentLsn, expectedLsn) >= 0) {
      logger.debug('Replica caught up', {
        attempt: attempt + 1,
        currentLsn,
        expectedLsn,
        sessionId,
      });
      return true;
    }

    // Exponential backoff
    if (attempt < MAX_RETRY_ATTEMPTS - 1) {
      const delayMs = INITIAL_RETRY_DELAY_MS * 2 ** attempt;
      logger.debug('Waiting for replica to catch up', {
        attempt: attempt + 1,
        delayMs,
        currentLsn,
        expectedLsn,
        sessionId,
      });
      await sleep(delayMs);
    }
  }

  logger.warn(
    'Replica did not catch up after max retries, falling back to primary',
    {
      sessionId,
      expectedLsn,
    },
  );
  return false;
}

/**
 * Prisma extension for session-based read-after-write consistency.
 *
 * This extension tracks WAL LSN positions after writes and ensures that
 * subsequent reads within the same session see those writes, even when
 * using read replicas.
 *
 * How it works:
 * 1. After any write operation with a session ID, it captures the WAL LSN
 * 2. Before read operations with a session ID, it checks if the replica has caught up
 * 3. If the replica hasn't caught up after retries, it forces the read to the primary
 *
 */
export function sessionConsistency() {
  return Prisma.defineExtension((client) =>
    client.$extends({
      name: 'session-consistency',
      query: {
        $allOperations: async ({
          operation,
          model,
          args,
          query,
          // This is a hack to force reads to primary when replica hasn't caught up.
          // The readReplicas extension routes queries to primary when in a transaction,
          // so we set __internalParams.transaction = true to achieve this.
          // @ts-expect-error - __internalParams is not in the types
          __internalParams,
        }) => {
          const sessionId = getAlsSessionId();

          // For write operations with session: cache WAL LSN after write
          if (isWriteOperation(operation)) {
            logger.info('Prisma operation', {
              operation,
              args,
              model,
            });

            const result = await query(args);

            if (sessionId) {
              // Get current WAL LSN and cache it for this session
              const lsn = await getCurrentWalLsn(client);
              if (lsn) {
                await cacheWalLsnForSession(sessionId, lsn);
                logger.debug('Cached WAL LSN after write', {
                  sessionId,
                  lsn,
                  operation,
                  model,
                });
              }
            }

            return result;
          }

          // For read operations with session: try replica first, fallback to primary
          if (isReadOperation(operation) && sessionId) {
            const replicaCaughtUp = await waitForReplicaCatchup(
              client,
              sessionId,
            );

            if (!replicaCaughtUp) {
              // This will force readReplicas extension to use primary
              __internalParams.transaction = true;
            }
          }

          return query(args);
        },
      },
    }),
  );
}
