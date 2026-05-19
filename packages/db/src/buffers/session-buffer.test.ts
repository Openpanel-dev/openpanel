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
  if (keys.length > 0) {
    await redis.del(...keys);
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

  it('registers the device in active+wallclock sorted sets and the projects set', async () => {
    await sessionBuffer.ingest(makePayload());

    expect(
      await redis.zscore(`session:active:${projectId}`, deviceId)
    ).not.toBeNull();
    expect(
      await redis.zscore(`session:wallclock:${projectId}`, deviceId)
    ).not.toBeNull();
    expect(await redis.sismember('session:projects', projectId)).toBe(1);
  });

  it('advances session:hwm:{pid} monotonically — never regresses', async () => {
    const t0 = new Date('2026-01-01T00:00:00.000Z');
    await sessionBuffer.ingest(makePayload({ createdAt: t0 }));
    expect(Number(await redis.get(`session:hwm:${projectId}`))).toBe(
      t0.getTime()
    );

    // A later event in event-time advances HWM.
    await sessionBuffer.ingest(
      makePayload({
        createdAt: new Date(t0.getTime() + 5000),
        deviceId: 'device-2',
      })
    );
    expect(Number(await redis.get(`session:hwm:${projectId}`))).toBe(
      t0.getTime() + 5000
    );

    // An older event does NOT regress HWM.
    await sessionBuffer.ingest(
      makePayload({
        createdAt: new Date(t0.getTime() - 5000),
        deviceId: 'device-3',
      })
    );
    expect(Number(await redis.get(`session:hwm:${projectId}`))).toBe(
      t0.getTime() + 5000
    );
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

  it('cleanup() removes blob, sorted set entries, and profile pointer', async () => {
    await sessionBuffer.ingest(
      makePayload({ profileId: 'profile-X', deviceId: 'device-Y' })
    );

    await sessionBuffer.cleanup({
      projectId,
      deviceId: 'device-Y',
      profileId: 'profile-X',
    });

    expect(await redis.get(`session:${projectId}:device-Y`)).toBeNull();
    expect(
      await redis.zscore(`session:active:${projectId}`, 'device-Y')
    ).toBeNull();
    expect(
      await redis.zscore(`session:wallclock:${projectId}`, 'device-Y')
    ).toBeNull();
    expect(
      await redis.get(`session:profile:${projectId}:profile-X`)
    ).toBeNull();
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
});
