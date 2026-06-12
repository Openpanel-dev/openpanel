import { getRedisCache } from '@openpanel/redis';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ch } from '../clickhouse/client';

vi.mock('../clickhouse/client', () => ({
  ch: {
    insert: vi.fn().mockResolvedValue(undefined),
  },
  TABLE_NAMES: {
    sessions: 'sessions',
  },
}));

import type { IServiceCreateEventPayload } from '../services/event.service';
import { SessionBuffer } from './session-buffer';

const redis = getRedisCache();

const projectId = 'project-1';
const deviceId = 'device-1';
const sessionId = 'session-1';

function makePayload(
  overrides: Partial<IServiceCreateEventPayload> = {}
): IServiceCreateEventPayload {
  return {
    name: 'screen_view',
    projectId,
    deviceId,
    sessionId,
    profileId: 'profile-1',
    properties: {},
    groups: [],
    createdAt: new Date(),
    duration: 0,
    sdkName: 'web',
    sdkVersion: '1.0.0',
    city: '',
    country: '',
    region: '',
    longitude: 0,
    latitude: 0,
    path: '/home',
    origin: '',
    referrer: '',
    referrerName: '',
    referrerType: '',
    os: '',
    osVersion: '',
    browser: '',
    browserVersion: '',
    device: '',
    brand: '',
    model: '',
    ...overrides,
  };
}

beforeEach(async () => {
  const keys = [
    ...(await redis.keys('session*')),
    ...(await redis.keys('lock:session')),
  ];
  // Spread breaks at ~100k args — del in chunks so old test state can't kill us.
  const BATCH = 1000;
  for (let i = 0; i < keys.length; i += BATCH) {
    await redis.del(...keys.slice(i, i + BATCH));
  }
  vi.mocked(ch.insert).mockResolvedValue(undefined as any);
});

afterAll(async () => {
  try {
    await redis.quit();
  } catch {}
});

describe('SessionBuffer', () => {
  let sessionBuffer: SessionBuffer;

  beforeEach(() => {
    sessionBuffer = new SessionBuffer();
  });

  it('opens a new session and stores it at session:{pid}:{did}', async () => {
    const result = await sessionBuffer.ingest(makePayload());

    expect(result?.kind).toBe('new');

    const blob = await redis.get(`session:${projectId}:${deviceId}`);
    expect(blob).not.toBeNull();
    const parsed = JSON.parse(blob ?? '');
    expect(parsed.id).toBe(sessionId);
    expect(parsed.project_id).toBe(projectId);
    expect(parsed.device_id).toBe(deviceId);
  });

  it('registers the device in the wallclock sorted set and the projects set', async () => {
    await sessionBuffer.ingest(makePayload());

    expect(
      await redis.zscore(`session:wallclock:${projectId}`, deviceId)
    ).not.toBeNull();
    expect(await redis.sismember('session:projects', projectId)).toBe(1);
  });

  it('writes no TTL on the session blob or profile pointer', async () => {
    await sessionBuffer.ingest(
      makePayload({ profileId: 'profile-X', deviceId: 'device-Y' })
    );

    // Blob and profile pointer must survive arbitrarily long reaper outages,
    // so neither carries a Redis TTL.
    expect(await redis.ttl(`session:${projectId}:device-Y`)).toBe(-1);
    expect(await redis.ttl(`session:profile:${projectId}:profile-X`)).toBe(-1);
  });

  it('writes profile→device pointer when profile_id differs from device_id', async () => {
    await sessionBuffer.ingest(
      makePayload({ profileId: 'profile-X', deviceId: 'device-Y' })
    );
    expect(await redis.get(`session:profile:${projectId}:profile-X`)).toBe(
      'device-Y'
    );
  });

  it('skips session_start and session_end events', async () => {
    const sizeBefore = await sessionBuffer.getBufferSize();
    expect(
      await sessionBuffer.ingest(makePayload({ name: 'session_start' }))
    ).toBeNull();
    expect(
      await sessionBuffer.ingest(makePayload({ name: 'session_end' }))
    ).toBeNull();
    expect(await sessionBuffer.getBufferSize()).toBe(sizeBefore);
  });

  it('emits sign=-1 + sign=+1 CH rows when extending within timeout', async () => {
    const t0 = new Date();
    await sessionBuffer.ingest(makePayload({ createdAt: t0 }));
    const sizeBefore = await sessionBuffer.getBufferSize();

    const result = await sessionBuffer.ingest(
      makePayload({ createdAt: new Date(t0.getTime() + 5000) })
    );

    expect(result?.kind).toBe('extend');
    expect(await sessionBuffer.getBufferSize()).toBe(sizeBefore + 2);
  });

  it('returns kind=boundary when gap > 30min, with closed + current populated', async () => {
    const t0 = new Date();
    const first = await sessionBuffer.ingest(makePayload({ createdAt: t0 }));
    expect(first?.kind).toBe('new');

    const second = await sessionBuffer.ingest(
      makePayload({
        createdAt: new Date(t0.getTime() + 35 * 60 * 1000),
        sessionId: 'session-2',
      })
    );

    expect(second?.kind).toBe('boundary');
    if (second?.kind === 'boundary') {
      expect(second.closed.id).toBe(sessionId);
      expect(second.current.id).toBe('session-2');
    }
  });

  it('invariant: one visit keeps one id across extends; a >30min gap splits and closes the first', async () => {
    // This ties the layers together against real Redis: ingest() drives the
    // state machine, and getExistingSession() is what the API reads on each
    // request to resolve the id — they must agree throughout a visit.
    const t0 = new Date('2026-06-08T12:00:00.000Z');
    const at = (mins: number) => new Date(t0.getTime() + mins * 60_000);

    const e1 = await sessionBuffer.ingest(
      makePayload({ createdAt: t0, sessionId: 'S1' })
    );
    expect(e1?.kind).toBe('new');
    expect(e1?.current.id).toBe('S1');
    // The API's next lookup must see the live session.
    expect(
      (await sessionBuffer.getExistingSession({ projectId, deviceId }))?.id
    ).toBe('S1');

    // Events within the idle window extend the SAME session.
    for (const mins of [10, 20]) {
      const ext = await sessionBuffer.ingest(
        makePayload({ createdAt: at(mins), sessionId: 'S1' })
      );
      expect(ext?.kind).toBe('extend');
      expect(ext?.current.id).toBe('S1');
    }

    // A >30min gap: ingest detects the boundary, closes S1, opens S2.
    const e4 = await sessionBuffer.ingest(
      makePayload({ createdAt: at(55), sessionId: 'S2' })
    );
    expect(e4?.kind).toBe('boundary');
    if (e4?.kind === 'boundary') {
      expect(e4.closed.id).toBe('S1');
      expect(e4.current.id).toBe('S2');
    }

    // The slot now holds the new session — the API reads S2 from here on.
    expect(
      (await sessionBuffer.getExistingSession({ projectId, deviceId }))?.id
    ).toBe('S2');
  });

  it('inherits utm_* fields from event.properties.__query', async () => {
    await sessionBuffer.ingest(
      makePayload({
        properties: {
          __query: {
            utm_medium: 'cpc',
            utm_source: 'google',
            utm_campaign: 'spring',
          },
        },
      })
    );
    const blob = JSON.parse(
      (await redis.get(`session:${projectId}:${deviceId}`)) ?? ''
    );
    expect(blob.utm_medium).toBe('cpc');
    expect(blob.utm_source).toBe('google');
    expect(blob.utm_campaign).toBe('spring');
  });

  it('out-of-order events: older event extends backwards, never produces negative duration', async () => {
    const t0 = new Date();
    await sessionBuffer.ingest(makePayload({ createdAt: t0 }));
    // Late-arriving event with an older timestamp.
    await sessionBuffer.ingest(
      makePayload({ createdAt: new Date(t0.getTime() - 30_000) })
    );
    const blob = JSON.parse(
      (await redis.get(`session:${projectId}:${deviceId}`)) ?? ''
    );
    expect(blob.duration).toBeGreaterThanOrEqual(0);
  });

  it('cleanup() removes blob, wallclock entry, and profile pointer', async () => {
    await sessionBuffer.ingest(
      makePayload({ profileId: 'profile-X', deviceId: 'device-Y' })
    );

    await sessionBuffer.cleanup({
      projectId,
      deviceId: 'device-Y',
      sessionId,
      profileId: 'profile-X',
    });

    expect(await redis.get(`session:${projectId}:device-Y`)).toBeNull();
    expect(
      await redis.zscore(`session:wallclock:${projectId}`, 'device-Y')
    ).toBeNull();
    expect(
      await redis.get(`session:profile:${projectId}:profile-X`)
    ).toBeNull();
  });

  it('cleanup() is a no-op when slot is owned by a different session (boundary)', async () => {
    // Open session S1
    await sessionBuffer.ingest(makePayload({ sessionId: 's1' }));
    // 35min later — boundary, opens S2 at same (pid, did)
    await sessionBuffer.ingest(
      makePayload({
        sessionId: 's2',
        createdAt: new Date(Date.now() + 35 * 60 * 1000),
      })
    );

    // Try to cleanup S1 — should not touch S2's data. The Lua script in
    // cleanup() detects the id mismatch and returns early.
    await sessionBuffer.cleanup({
      projectId,
      deviceId,
      sessionId: 's1',
    });

    const blob = await redis.get(`session:${projectId}:${deviceId}`);
    expect(blob).not.toBeNull();
    const parsed = JSON.parse(blob ?? '');
    expect(parsed.id).toBe('s2');
    expect(
      await redis.zscore(`session:wallclock:${projectId}`, deviceId)
    ).not.toBeNull();
  });

  it('processes buffer and inserts sessions into ClickHouse', async () => {
    await sessionBuffer.ingest(makePayload());

    const insertSpy = vi
      .spyOn(ch, 'insert')
      .mockResolvedValueOnce(undefined as any);

    await sessionBuffer.processBuffer();

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ table: 'sessions', format: 'JSONEachRow' })
    );
    expect(await sessionBuffer.getBufferSize()).toBe(0);

    insertSpy.mockRestore();
  });

  it('squash does not orphan the creation row when create + updates share a batch', async () => {
    // Regression: a brand-new session whose creation event and subsequent
    // updates all land in one flush window. ingest emits (+1,v1) for the
    // creation then (-1,vN)/(+1,vN+1) pairs for each update. The squash must
    // net per version so nothing is left un-collapsible: a (-1,V) row only
    // collapses against a (+1,V) of the SAME version in CH.
    const t0 = Date.now();
    const EVENTS = 8;
    for (let i = 0; i < EVENTS; i++) {
      await sessionBuffer.ingest(
        makePayload({ createdAt: new Date(t0 + i * 1000) })
      );
    }

    const inserted: Array<{ sign: number; version: number }> = [];
    const insertSpy = vi
      .spyOn(ch, 'insert')
      .mockImplementation(async ({ values }: any) => {
        for (const v of values) {
          inserted.push({ sign: v.sign, version: v.version });
        }
        return undefined as any;
      });

    await sessionBuffer.processBuffer();

    // Squash must actually fire. The 8 events queue 1 creation + 7
    // (-1,vN)/(+1,vN+1) pairs = 15 raw rows; for a fresh session with no
    // CH-resident row they all net down to the single final (+1, v8). If
    // squash is disabled/removed, every raw row is inserted and this is 15
    // — this assertion is the guard that the optimisation is wired in.
    expect(inserted.length).toBe(1);

    // Net the inserted rows per version exactly as CH's
    // VersionedCollapsingMergeTree(sign, version) would: a row survives only
    // if positives and negatives at its version don't cancel.
    const netByVersion = new Map<number, number>();
    for (const { sign, version } of inserted) {
      netByVersion.set(version, (netByVersion.get(version) ?? 0) + sign);
    }
    const survivors = [...netByVersion.entries()].filter(([, net]) => net !== 0);

    // A fresh session must collapse to exactly one final +1 row, with no
    // orphaned negatives (the bug left a permanent (-1, v1)).
    expect(survivors).toEqual([[EVENTS, 1]]);

    insertSpy.mockRestore();
  });

  it('retains sessions in queue when ClickHouse insert fails', async () => {
    await sessionBuffer.ingest(makePayload());

    const insertSpy = vi
      .spyOn(ch, 'insert')
      .mockRejectedValueOnce(new Error('ClickHouse unavailable'));

    // Errors now propagate to tryFlush (which handles them by resyncing the
    // counter). processBuffer no longer swallows — we still verify the
    // safety property: the queue is preserved.
    await expect(sessionBuffer.processBuffer()).rejects.toThrow(
      'ClickHouse unavailable'
    );
    expect(await sessionBuffer.getBufferSize()).toBe(1);

    insertSpy.mockRestore();
  });

  it('does not re-insert already-landed chunks when a later chunk fails', async () => {
    process.env.SESSION_BUFFER_CHUNK_SIZE = '1';
    try {
      const buffer = new SessionBuffer();
      await buffer.ingest(
        makePayload({ deviceId: 'device-A', sessionId: 'session-A' })
      );
      await buffer.ingest(
        makePayload({ deviceId: 'device-B', sessionId: 'session-B' })
      );
      expect(await buffer.getBufferSize()).toBe(2);

      // chunkSize=1 → two single-row chunks. The first lands in CH, the
      // second throws (e.g. request timeout).
      vi.mocked(ch.insert).mockClear();
      vi.mocked(ch.insert)
        .mockResolvedValueOnce(undefined as any)
        .mockRejectedValueOnce(new Error('ClickHouse unavailable'));

      await expect(buffer.processBuffer()).rejects.toThrow(
        'ClickHouse unavailable'
      );

      // Only the failed row may be re-queued. The old LRANGE→LTRIM design
      // kept BOTH rows queued (the LTRIM never ran), so the next flush
      // re-inserted the already-landed chunk — duplicate rows in CH that
      // double-count the session in every sum(sign * ...) metric.
      expect(await buffer.getBufferSize()).toBe(1);

      vi.mocked(ch.insert).mockResolvedValue(undefined as any);
      await buffer.processBuffer();
      expect(await buffer.getBufferSize()).toBe(0);

      // device-A's row went to CH exactly once across both flushes.
      const callsWithA = vi
        .mocked(ch.insert)
        .mock.calls.filter((c) =>
          ((c[0] as any).values as any[]).some(
            (row) => row.device_id === 'device-A'
          )
        ).length;
      expect(callsWithA).toBe(1);
    } finally {
      delete process.env.SESSION_BUFFER_CHUNK_SIZE;
    }
  });
});
