// The daily backstop for sessions whose cleanup leaked: a lingering blob →
// id-gated cleanup; a missing blob → ZREM the orphan.

import { describe, expect, test } from 'bun:test';
import { testCoreConfig } from '../../../../test/config-fixture';
import {
  fixtureSession,
  stubLogger,
  stubRedis,
  stubStore,
} from './lifecycle.fixtures';
import { vacuumStaleSessions } from './session-vacuum';

function makeDeps(
  live: ReturnType<typeof fixtureSession> | null,
  config = testCoreConfig()
) {
  const redis = stubRedis();
  const sessions = stubStore(live);
  return {
    redis,
    sessions,
    deps: { redis, sessions, logger: stubLogger(), config },
  };
}

describe('vacuumStaleSessions', () => {
  test('id-gated cleanup() for a stale blob that lingered', async () => {
    const { deps, redis, sessions } = makeDeps(
      fixtureSession({
        id: 'sess-stale',
        device_id: 'dev-stale',
        profile_id: 'dev-stale',
      })
    );
    redis.zrangebyscore.mockResolvedValue(['dev-stale']);

    await vacuumStaleSessions(deps);

    expect(sessions.cleanup).toHaveBeenCalledWith({
      projectId: 'proj-1',
      deviceId: 'dev-stale',
      sessionId: 'sess-stale',
      profileId: 'dev-stale',
    });
    expect(redis.zrem).not.toHaveBeenCalled();
  });

  test('ZREMs an orphan wallclock entry when the blob is gone', async () => {
    const { deps, redis, sessions } = makeDeps(null);
    redis.zrangebyscore.mockResolvedValue(['dev-orphan']);

    await vacuumStaleSessions(deps);

    expect(sessions.cleanup).not.toHaveBeenCalled();
    expect(redis.zrem).toHaveBeenCalledWith(
      'session:wallclock:proj-1',
      'dev-orphan'
    );
  });

  test('is a no-op when disabled via SESSION_VACUUM=0', async () => {
    const { deps, redis } = makeDeps(
      null,
      testCoreConfig({
        session: { ...testCoreConfig().session, vacuumEnabled: false },
      })
    );

    await vacuumStaleSessions(deps);

    expect(redis.smembers).not.toHaveBeenCalled();
  });
});
