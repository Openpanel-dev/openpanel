/**
 * Tests for the daily vacuum — the backstop for sessions whose cleanup() leaked
 * (worker crash mid-MULTI). For wallclock entries older than the stale threshold:
 * a lingering blob → id-gated cleanup(); a missing blob → ZREM the orphan.
 */

import type { IClickhouseSession } from '@openpanel/db';
import { sessionBuffer } from '@openpanel/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionVacuumCronJob } from './cron.session-vacuum';

const { redisMock } = vi.hoisted(() => ({
  redisMock: {
    smembers: vi.fn(),
    zrangebyscore: vi.fn(),
    zrem: vi.fn(),
  },
}));

vi.mock('@openpanel/redis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@openpanel/redis')>();
  return { ...actual, getRedisCache: () => redisMock };
});

vi.mock('@openpanel/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@openpanel/db')>();
  return {
    ...actual,
    sessionBuffer: { getExistingSession: vi.fn(), cleanup: vi.fn() },
  };
});

vi.mock('@/metrics', () => ({
  sessionsVacuumed: { inc: vi.fn() },
}));

const getExistingSession = vi.mocked(sessionBuffer.getExistingSession);
const cleanup = vi.mocked(sessionBuffer.cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  redisMock.smembers.mockResolvedValue(['proj-1']);
  redisMock.zrem.mockResolvedValue(1);
  redisMock.zrangebyscore.mockResolvedValue([]);
  cleanup.mockResolvedValue(undefined as never);
});

describe('sessionVacuumCronJob', () => {
  it('id-gated cleanup() for a stale blob that lingered', async () => {
    redisMock.zrangebyscore.mockResolvedValue(['dev-stale']);
    getExistingSession.mockResolvedValue({
      id: 'sess-stale',
      project_id: 'proj-1',
      device_id: 'dev-stale',
      profile_id: 'dev-stale',
    } as unknown as IClickhouseSession);

    await sessionVacuumCronJob();

    expect(cleanup).toHaveBeenCalledWith({
      projectId: 'proj-1',
      deviceId: 'dev-stale',
      sessionId: 'sess-stale',
      profileId: 'dev-stale',
    });
    expect(redisMock.zrem).not.toHaveBeenCalled();
  });

  it('ZREMs an orphan wallclock entry when the blob is gone', async () => {
    redisMock.zrangebyscore.mockResolvedValue(['dev-orphan']);
    getExistingSession.mockResolvedValue(null);

    await sessionVacuumCronJob();

    expect(cleanup).not.toHaveBeenCalled();
    expect(redisMock.zrem).toHaveBeenCalledWith(
      'session:wallclock:proj-1',
      'dev-orphan'
    );
  });

  it('is a no-op when disabled via SESSION_VACUUM=0', async () => {
    vi.stubEnv('SESSION_VACUUM', '0');

    await sessionVacuumCronJob();

    expect(redisMock.smembers).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
