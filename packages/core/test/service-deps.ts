// A real `ServiceDeps` for integration tests: the same singletons `main.ts`
// hands to `AppDeps`, pointed at the isolated `openpanel_test` databases by
// preload.ts. `clients`, `buffers` and `queues` are unused by the read-path
// services these tests exercise, so they stay unbuilt and a test that reaches
// one gets a named error rather than silently working against a half-built
// container.

import type { Logger } from '../src/logger';
import type { ServiceDeps, Services } from '../src/services';
import { testCoreConfig } from './config-fixture';

/** Records what the ClickHouse/Postgres call was logged with — the requestId
 *  chain's observation point. */
export function recordingLogger(
  bindings: Record<string, unknown> = {},
  lines: Array<{ bindings: Record<string, unknown>; message: string }> = []
): Logger & { lines: typeof lines; bindings: Record<string, unknown> } {
  const noop = () => undefined;
  const logger = {
    bindings,
    lines,
    fatal: noop,
    error: noop,
    warn: noop,
    info: (_obj: unknown, message?: string) => {
      lines.push({ bindings, message: message ?? '' });
    },
    debug: noop,
    trace: noop,
    child: (extra: Record<string, unknown>) =>
      recordingLogger({ ...bindings, ...extra }, lines),
  };
  return logger as unknown as Logger & {
    lines: typeof lines;
    bindings: Record<string, unknown>;
  };
}

function unavailable(name: string): never {
  throw new Error(`${name} is not built in this test`);
}

/** The `services()` thunk every factory takes (ADR-022 R3). No suite here
 *  reaches a sibling, so calling it is a named error rather than a silently
 *  half-built container; a suite that needs one passes its own thunk. */
export function testServices(): () => Services {
  return () => unavailable('services()');
}

export async function testServiceDeps(
  overrides: Partial<ServiceDeps> = {}
): Promise<ServiceDeps> {
  const [{ db, Prisma }, { ch }, redis] = await Promise.all([
    import('@openpanel/db/src/prisma-client'),
    import('@openpanel/db/src/clickhouse/client'),
    import('@openpanel/redis').then((m) => m.getRedisCache()),
  ]);
  return {
    db,
    prisma: { DbNull: Prisma.DbNull, JsonNull: Prisma.JsonNull },
    ch,
    redis,
    logger: recordingLogger(),
    config: testCoreConfig(),
    get clients(): never {
      return unavailable('ServiceDeps.clients');
    },
    get buffers(): never {
      return unavailable('ServiceDeps.buffers');
    },
    get queues(): never {
      return unavailable('ServiceDeps.queues');
    },
    ...overrides,
  };
}
