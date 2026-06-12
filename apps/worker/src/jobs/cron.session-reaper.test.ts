/**
 * Tests for the session reaper — the wall-clock deadman that closes idle
 * sessions. Redis is mocked (we drive the wallclock ZSET + lock), sessionBuffer
 * and enqueueSessionEndV2 are mocked so we assert decisions, not side effects.
 */

import type { IClickhouseSession } from '@openpanel/db';
import { sessionBuffer } from '@openpanel/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enqueueSessionEndV2 } from '@/utils/session-handler';
import { sessionReaperCronJob } from './cron.session-reaper';

const { redisMock } = vi.hoisted(() => ({
  redisMock: {
    smembers: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    zrangebyscore: vi.fn(),
    zcard: vi.fn(),
    srem: vi.fn(),
    zrem: vi.fn(),
  },
}));

vi.mock('@openpanel/redis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@openpanel/redis')>();
  return { ...actual, getRedisCache: () => redisMock };
});

vi.mock('@openpanel/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@openpanel/db')>();
  return { ...actual, sessionBuffer: { getExistingSession: vi.fn() } };
});

vi.mock('@/utils/session-handler', () => ({
  enqueueSessionEndV2: vi.fn().mockResolvedValue(undefined),
}));

// Concrete metric stubs — avoid loading the real metrics module (it registers
// prom gauges at import) and avoid a Proxy (its `then` trap confuses ESM interop).
vi.mock('@/metrics', () => {
  const counter = () => ({ inc: vi.fn(), observe: vi.fn(), set: vi.fn() });
  return {
    sessionEndsEnqueued: counter(),
    sessionsReaped: counter(),
    sessionsReaperOrphans: counter(),
  };
});

const getExistingSession = vi.mocked(sessionBuffer.getExistingSession);

const session = (id: string, deviceId: string): IClickhouseSession =>
  ({
    id,
    project_id: 'proj-1',
    device_id: deviceId,
    profile_id: deviceId,
    ended_at: '2026-06-08 11:00:00',
    duration: 1000,
    groups: [],
  }) as unknown as IClickhouseSession;

beforeEach(() => {
  vi.clearAllMocks();
  redisMock.smembers.mockResolvedValue(['proj-1']);
  redisMock.set.mockResolvedValue('OK'); // lock acquired
  redisMock.del.mockResolvedValue(1);
  redisMock.zcard.mockResolvedValue(0); // project drained after reap
  redisMock.srem.mockResolvedValue(1);
  redisMock.zrem.mockResolvedValue(1);
  redisMock.zrangebyscore.mockResolvedValue([]);
});

describe('sessionReaperCronJob', () => {
  it('enqueues a session_end for an idle session blob', async () => {
    redisMock.zrangebyscore.mockResolvedValue(['dev-1']);
    getExistingSession.mockResolvedValue(session('sess-1', 'dev-1'));

    await sessionReaperCronJob();

    expect(enqueueSessionEndV2).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(enqueueSessionEndV2).mock.calls[0]![0].closedSession.id
    ).toBe('sess-1');
    // wallclock index emptied → project removed from the active set
    expect(redisMock.srem).toHaveBeenCalledWith('session:projects', 'proj-1');
  });

  it('ZREMs an orphan (wallclock entry with no blob) and does not enqueue', async () => {
    redisMock.zrangebyscore.mockResolvedValue(['dev-orphan']);
    getExistingSession.mockResolvedValue(null);

    await sessionReaperCronJob();

    expect(enqueueSessionEndV2).not.toHaveBeenCalled();
    expect(redisMock.zrem).toHaveBeenCalledWith(
      'session:wallclock:proj-1',
      'dev-orphan'
    );
  });

  it('skips a project when the advisory lock is held', async () => {
    redisMock.set.mockResolvedValue(null); // NX failed → another pod owns it

    await sessionReaperCronJob();

    expect(redisMock.zrangebyscore).not.toHaveBeenCalled();
    expect(enqueueSessionEndV2).not.toHaveBeenCalled();
  });

  it('is a no-op when disabled via SESSION_REAPER=0', async () => {
    vi.stubEnv('SESSION_REAPER', '0');

    await sessionReaperCronJob();

    expect(redisMock.smembers).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
