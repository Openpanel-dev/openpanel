/**
 * Shared afterAll cleanup registered via setupFiles in vitest.shared.ts.
 *
 * Closes the ClickHouse keep-alive pool and disconnects Prisma after every
 * test file so worker threads can exit cleanly.
 *
 * Uses dynamic imports + try-catch so this is safe in packages that mock
 * these modules or don't use real connections.
 */
import { afterAll } from 'vitest';

afterAll(async () => {
  await Promise.allSettled([
    (async () => {
      const { originalCh } = await import(
        '../packages/db/src/clickhouse/client'
      );
      if (typeof originalCh?.close === 'function') {
        await originalCh.close();
      }
    })(),
    (async () => {
      const { db } = await import('../packages/db/src/prisma-client');
      await db.$disconnect();
    })(),
  ]);
});
