// Ported from apps/worker/src/jobs/cron.session-reaper.test.ts. The wall-clock
// deadman that closes idle sessions: stub Redis drives the wallclock ZSET +
// lock, so the assertions are on decisions, not side effects.

import { describe, expect, mock, test } from 'bun:test';
import { testCoreConfig } from '../../../../test/config-fixture';
import {
  fixtureSession,
  stubLogger,
  stubRedis,
  stubStore,
} from './lifecycle.fixtures';
import { reapIdleSessions, type SessionReaperDeps } from './session-reaper';

function makeDeps(
  live: ReturnType<typeof fixtureSession> | null,
  config = testCoreConfig()
) {
  const redis = stubRedis();
  const sessions = stubStore(live);
  const enqueueSessionEnd = mock<SessionReaperDeps['enqueueSessionEnd']>(
    async () => undefined
  );
  return {
    redis,
    sessions,
    enqueueSessionEnd,
    deps: {
      redis,
      sessions,
      enqueueSessionEnd,
      logger: stubLogger(),
      config,
    },
  };
}

describe('reapIdleSessions', () => {
  test('enqueues a session_end for an idle session blob', async () => {
    const { deps, redis, enqueueSessionEnd } = makeDeps(
      fixtureSession({ id: 'sess-1', device_id: 'dev-1' })
    );
    redis.zrangebyscore.mockResolvedValue(['dev-1']);

    await reapIdleSessions(deps);

    expect(enqueueSessionEnd).toHaveBeenCalledTimes(1);
    expect(enqueueSessionEnd.mock.calls[0]?.[0]).toMatchObject({
      closedSession: { id: 'sess-1' },
      payload: { projectId: 'proj-1', deviceId: 'dev-1', name: 'session_end' },
    });
    // wallclock index emptied → project removed from the active set
    expect(redis.srem).toHaveBeenCalledWith('session:projects', 'proj-1');
    expect(redis.del).toHaveBeenCalledWith('session:reaper:lock:proj-1');
  });

  test('ZREMs an orphan (wallclock entry with no blob) and does not enqueue', async () => {
    const { deps, redis, enqueueSessionEnd } = makeDeps(null);
    redis.zrangebyscore.mockResolvedValue(['dev-orphan']);

    await reapIdleSessions(deps);

    expect(enqueueSessionEnd).not.toHaveBeenCalled();
    expect(redis.zrem).toHaveBeenCalledWith(
      'session:wallclock:proj-1',
      'dev-orphan'
    );
  });

  test('skips a project when the advisory lock is held', async () => {
    const { deps, redis, enqueueSessionEnd } = makeDeps(null);
    redis.set.mockResolvedValue(null); // NX failed → another pod owns it

    await reapIdleSessions(deps);

    expect(redis.set).toHaveBeenCalledTimes(1);
    expect(redis.zrangebyscore).not.toHaveBeenCalled();
    expect(enqueueSessionEnd).not.toHaveBeenCalled();
  });

  test('is a no-op when disabled via SESSION_REAPER=0', async () => {
    const { deps, redis } = makeDeps(
      null,
      testCoreConfig({
        session: { ...testCoreConfig().session, reaperEnabled: false },
      })
    );

    await reapIdleSessions(deps);

    expect(redis.smembers).not.toHaveBeenCalled();
  });
});
