import { beforeEach, expect, mock, test } from 'bun:test';
import { getRedisCache } from '@openpanel/redis';
import type { Logger } from '../../logger';
import {
  type CodeMigrationRunner,
  startCodeMigrations,
} from './code-migration.service';

const LOCK_KEY = 'lock:code-migrations';
const FAST = { lockTtlMs: 300, lockRenewIntervalMs: 50, retryIntervalMs: 50 };

const redis = getRedisCache();
const STILL_RUNNING = 'query still running';

/** The real client, except that every Lua script call goes through `script`. */
function withScripts(script: () => Promise<unknown>): typeof redis {
  return new Proxy(redis, {
    get(target, property) {
      if (property === 'evalsha' || property === 'eval') {
        return script;
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function silentLogger(): Logger {
  const log = () => undefined;
  const logger: Logger = {
    fatal: log,
    error: log,
    warn: log,
    info: log,
    debug: log,
    trace: log,
    child: () => logger,
  };
  return logger;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A runner over an in-memory list; `run` removes a migration once it ran. */
function fakeRunner(
  pending: string[],
  run: (file: string) => Promise<void> = async () => undefined
) {
  const ran: string[] = [];
  const runner = {
    getPending: mock(async () => [...pending]),
    run: mock(async (file: string) => {
      await run(file);
      ran.push(file);
      pending.splice(pending.indexOf(file), 1);
    }),
    abort: mock((): void => undefined),
    allow: mock((): void => undefined),
    isQueryStillRunning: (error: unknown) =>
      error instanceof Error && error.message === STILL_RUNNING,
  } satisfies CodeMigrationRunner;
  return { runner, ran };
}

beforeEach(async () => {
  await redis.del(LOCK_KEY);
});

test('does nothing and never locks when nothing is pending', async () => {
  const { runner } = fakeRunner([]);
  const set = mock(redis.set.bind(redis));
  const handle = startCodeMigrations(
    {
      redis: { ...redis, set } as unknown as typeof redis,
      logger: silentLogger(),
      migrations: runner,
    },
    FAST
  );
  await handle.done;
  expect(runner.getPending).toHaveBeenCalled();
  expect(set).not.toHaveBeenCalled();
  expect(runner.run).not.toHaveBeenCalled();
});

test('runs pending migrations in order and releases the lock', async () => {
  const { runner, ran } = fakeRunner(['27-a.ts', '28-b.ts']);
  const handle = startCodeMigrations(
    { redis, logger: silentLogger(), migrations: runner },
    FAST
  );
  await handle.done;
  expect(ran).toEqual(['27-a.ts', '28-b.ts']);
  expect(runner.allow).toHaveBeenCalled();
  expect(await redis.get(LOCK_KEY)).toBeNull();
});

test('waits while another process holds the lock, then takes over', async () => {
  await redis.set(LOCK_KEY, 'someone-else', 'PX', 10_000);
  const { runner, ran } = fakeRunner(['27-a.ts']);
  const handle = startCodeMigrations(
    { redis, logger: silentLogger(), migrations: runner },
    FAST
  );
  await sleep(200);
  expect(runner.run).not.toHaveBeenCalled();

  await redis.del(LOCK_KEY);
  await handle.done;
  expect(ran).toEqual(['27-a.ts']);
});

test('retries a failed migration and releases the lock in between', async () => {
  let attempts = 0;
  let lockDuringRetryWait: string | null = 'unset';
  const { runner, ran } = fakeRunner(['27-a.ts'], async () => {
    attempts += 1;
    if (attempts === 1) {
      setTimeout(async () => {
        lockDuringRetryWait = await redis.get(LOCK_KEY);
      }, 20);
      throw new Error('clickhouse went away');
    }
  });
  const handle = startCodeMigrations(
    { redis, logger: silentLogger(), migrations: runner },
    FAST
  );
  await handle.done;
  expect(attempts).toBe(2);
  expect(ran).toEqual(['27-a.ts']);
  expect(lockDuringRetryWait).toBeNull();
});

test('aborts when the lock is taken over mid-run', async () => {
  let release: () => void = () => undefined;
  const { runner } = fakeRunner(['27-a.ts'], async () => {
    // Another process steals the lock, then the abort ends this run.
    await redis.set(LOCK_KEY, 'thief', 'PX', 10_000);
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    throw new Error('Migration commands aborted');
  });
  runner.abort.mockImplementation(() => release());
  const handle = startCodeMigrations(
    { redis, logger: silentLogger(), migrations: runner },
    FAST
  );
  await sleep(200);
  expect(runner.abort).toHaveBeenCalled();
  // The thief's lock is not ours to release.
  expect(await redis.get(LOCK_KEY)).toBe('thief');
  await handle.stop();
  await handle.done;
});

test('stop() aborts the running migration and stops retrying', async () => {
  let release: () => void = () => undefined;
  const { runner } = fakeRunner(['27-a.ts'], async () => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    throw new Error('Migration commands aborted');
  });
  runner.abort.mockImplementation(() => release());
  const handle = startCodeMigrations(
    { redis, logger: silentLogger(), migrations: runner },
    FAST
  );
  await sleep(50);
  await handle.stop();
  expect(runner.abort).toHaveBeenCalled();
  // Released by the time stop() settles, not only after the TTL.
  expect(await redis.get(LOCK_KEY)).toBeNull();
  await sleep(150);
  expect(runner.run).toHaveBeenCalledTimes(1);
});

test('aborts before the lock can expire when renewals keep failing', async () => {
  let release: () => void = () => undefined;
  const { runner } = fakeRunner(['28-a.ts'], async () => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    throw new Error('Migration commands aborted');
  });
  let abortedAfterMs = 0;
  const startedAt = performance.now();
  runner.abort.mockImplementation(() => {
    abortedAfterMs = performance.now() - startedAt;
    release();
  });
  const handle = startCodeMigrations(
    {
      redis: withScripts(() => Promise.reject(new Error('redis unreachable'))),
      logger: silentLogger(),
      migrations: runner,
    },
    FAST
  );
  await sleep(FAST.lockTtlMs + 100);
  expect(runner.abort).toHaveBeenCalled();
  expect(abortedAfterMs).toBeLessThan(FAST.lockTtlMs);
  await handle.stop();
});

test('keeps the lock when an aborted query may still be running', async () => {
  const { runner } = fakeRunner(['28-a.ts'], async () => {
    throw new Error(STILL_RUNNING);
  });
  const handle = startCodeMigrations(
    { redis, logger: silentLogger(), migrations: runner },
    { ...FAST, retryIntervalMs: 10_000 }
  );
  await sleep(50);
  expect(runner.run).toHaveBeenCalledTimes(1);
  expect(await redis.get(LOCK_KEY)).not.toBeNull();
  await handle.stop();
});

test('ignores a renewal answer that arrives after the run finished', async () => {
  const { runner } = fakeRunner(['28-a.ts'], async () => {
    await sleep(FAST.lockRenewIntervalMs + 10);
  });
  // The renewal sent during the run answers "not yours" only after it ended.
  const slowNotOwned = () => sleep(100).then(() => 0);
  const handle = startCodeMigrations(
    {
      redis: withScripts(slowNotOwned),
      logger: silentLogger(),
      migrations: runner,
    },
    FAST
  );
  await handle.done;
  await sleep(150);
  expect(runner.run).toHaveBeenCalledTimes(1);
  expect(runner.abort).not.toHaveBeenCalled();
});
