// Applies pending code migrations from the running api, so it serves from the
// moment it starts instead of waiting on them. The migration functions are
// injected so the orchestration is testable without `mock.module`.

import type { Redis } from '@openpanel/redis';
import { generateSecureId } from '@openpanel/shared';
import { defineRedisScript } from '../../buffers/redis-script';
import type { Logger } from '../../logger';

const LOCK_KEY = 'lock:code-migrations';
// Short, and renewed while a migration runs, so a crashed holder frees the
// lock within a minute instead of blocking the others for hours.
const LOCK_TTL_MS = 60_000;
const LOCK_RENEW_INTERVAL_MS = 20_000;
const RETRY_INTERVAL_MS = 5 * 60_000;

const renewLockScript = defineRedisScript(`
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("PEXPIRE", KEYS[1], ARGV[2])
end
return 0
`);

const releaseLockScript = defineRedisScript(`
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`);

export interface CodeMigrationRunner {
  /** Unfinished migrations in run order: blocking first, then online. */
  getPending: () => Promise<string[]>;
  /** Runs one migration and records it as finished; throws on failure. */
  run: (file: string) => Promise<void>;
  /** Kills the statement in flight; nothing more runs until `allow()`. */
  abort: () => void;
  allow: () => void;
}

export interface CodeMigrationDeps {
  redis: Redis;
  logger: Logger;
  migrations: CodeMigrationRunner;
}

export interface CodeMigrationTiming {
  lockTtlMs: number;
  lockRenewIntervalMs: number;
  retryIntervalMs: number;
}

export interface CodeMigrationsHandle {
  /**
   * Stops retrying and aborts a migration this process is running; settles
   * once that run has unwound and released the lock, so the next process can
   * take over at once instead of waiting out the lock's TTL.
   */
  stop: () => Promise<void>;
  /** Settles once nothing is pending or `stop()` was called. */
  done: Promise<void>;
}

type AttemptResult = 'finished' | 'retry';

/**
 * Every process calls this once it listens; the lock picks one to do the
 * work, so replicas never run a migration twice at once. The others check
 * back every `retryIntervalMs`, so a holder that dies mid-way is replaced and
 * the migration resumes, which online migrations must support.
 */
export function startCodeMigrations(
  deps: CodeMigrationDeps,
  timing: CodeMigrationTiming = {
    lockTtlMs: LOCK_TTL_MS,
    lockRenewIntervalMs: LOCK_RENEW_INTERVAL_MS,
    retryIntervalMs: RETRY_INTERVAL_MS,
  }
): CodeMigrationsHandle {
  const { redis, migrations } = deps;
  const logger = deps.logger.child({ name: 'code-migrations' });
  let isStopped = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | undefined;
  let finish: () => void = () => undefined;
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });

  async function runPending(lockId: string): Promise<void> {
    let isLockLost = false;
    const renewTimer = setInterval(async () => {
      try {
        const renewed = await renewLockScript(
          redis,
          [LOCK_KEY],
          [lockId, String(timing.lockTtlMs)]
        );
        if (renewed === 1) {
          return;
        }
      } catch (error) {
        logger.warn({ err: error }, 'code migration lock renewal failed');
        return;
      }
      // Another process may take over now; two copies running at once is the
      // one thing an online migration cannot survive.
      isLockLost = true;
      logger.error('code migration lock lost, aborting');
      migrations.abort();
    }, timing.lockRenewIntervalMs);

    try {
      for (const file of await migrations.getPending()) {
        if (isStopped || isLockLost) {
          return;
        }
        const startedAt = performance.now();
        logger.info({ migration: file }, 'code migration started');
        await migrations.run(file);
        logger.info(
          {
            migration: file,
            durationMs: Math.round(performance.now() - startedAt),
          },
          'code migration finished'
        );
      }
    } finally {
      clearInterval(renewTimer);
      await releaseLockScript(redis, [LOCK_KEY], [lockId]).catch(
        () => undefined
      );
    }
  }

  async function attempt(): Promise<AttemptResult> {
    const pending = await migrations.getPending();
    if (pending.length === 0) {
      return 'finished';
    }

    const lockId = generateSecureId('lock');
    const acquired = await redis.set(
      LOCK_KEY,
      lockId,
      'PX',
      timing.lockTtlMs,
      'NX'
    );
    if (acquired !== 'OK') {
      logger.info(
        { pending },
        'code migrations pending; another process is running them'
      );
      return 'retry';
    }

    migrations.allow();
    await runPending(lockId);
    return (await migrations.getPending()).length === 0 ? 'finished' : 'retry';
  }

  async function tick(): Promise<void> {
    if (isStopped) {
      return;
    }
    let result: AttemptResult = 'retry';
    try {
      result = await attempt();
    } catch (error) {
      if (!isStopped) {
        logger.error({ err: error }, 'code migration failed, retrying later');
      }
    }
    if (result === 'finished') {
      logger.info('code migrations up to date');
    }
    if (result === 'finished' || isStopped) {
      finish();
      return;
    }
    scheduleTick(timing.retryIntervalMs);
  }

  function scheduleTick(delayMs: number) {
    retryTimer = setTimeout(() => {
      running = tick();
    }, delayMs);
    retryTimer.unref?.();
  }

  scheduleTick(0);

  return {
    stop: async () => {
      isStopped = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
      migrations.abort();
      await running;
      finish();
    },
    done,
  };
}
