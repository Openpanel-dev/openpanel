/**
 * Tests for getDeviceId's session resolution against the device-keyed session
 * store. The id is reused from the live blob only while it's within the idle
 * window; a lingering (past-window) blob must NOT be reused — see the guard in
 * ids.ts. Override device ids resolve through the same path with a single read.
 *
 * We spy on the real `sessionBuffer.getExistingSession` singleton (no Redis),
 * and use the real `formatClickhouseDate` so `ended_at` round-trips exactly.
 */

import type { IClickhouseSession } from '@openpanel/db';
import { formatClickhouseDate, sessionBuffer } from '@openpanel/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDeviceId } from './ids';

const NOW = new Date('2026-06-08T12:00:00.000Z').getTime();
const MINUTE = 60 * 1000;
const SALTS = { current: 'salt-current', previous: 'salt-previous' };
const BASE = {
  projectId: 'proj-1',
  ip: '1.2.3.4',
  ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/148.0.0.0',
  salts: SALTS,
  eventTimeMs: NOW,
};

// withinIdleWindow only reads `id` + `ended_at`; the rest is irrelevant here.
const fakeSession = (id: string, endedAtMs: number): IClickhouseSession =>
  ({
    id,
    ended_at: formatClickhouseDate(new Date(endedAtMs)),
  }) as unknown as IClickhouseSession;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getDeviceId — session resolution', () => {
  it('mints a deterministic, stable id when no session exists', async () => {
    const spy = vi
      .spyOn(sessionBuffer, 'getExistingSession')
      .mockResolvedValue(null);

    const a = await getDeviceId({ ...BASE, overrideDeviceId: 'cookie-abc' });
    const b = await getDeviceId({ ...BASE, overrideDeviceId: 'cookie-abc' });

    expect(a.sessionId).toBeTruthy();
    expect(b.sessionId).toBe(a.sessionId); // same window → same id
    expect(a.deviceId).toBe('cookie-abc');
    expect(spy).toHaveBeenCalled();
  });

  it('reuses the live session id when within the idle window', async () => {
    vi.spyOn(sessionBuffer, 'getExistingSession').mockResolvedValue(
      fakeSession('sess-live', NOW - MINUTE)
    );

    const result = await getDeviceId({
      ...BASE,
      overrideDeviceId: 'cookie-abc',
    });

    expect(result).toEqual({ deviceId: 'cookie-abc', sessionId: 'sess-live' });
  });

  it('does NOT reuse a session that has lingered past the idle window', async () => {
    vi.spyOn(sessionBuffer, 'getExistingSession').mockResolvedValue(
      // ended 31 min ago — past the 30 min timeout; the reaper just hasn't
      // closed it yet (blobs have no TTL).
      fakeSession('sess-stale', NOW - 31 * MINUTE)
    );

    const result = await getDeviceId({
      ...BASE,
      overrideDeviceId: 'cookie-abc',
    });

    expect(result.deviceId).toBe('cookie-abc');
    expect(result.sessionId).toBeTruthy();
    expect(result.sessionId).not.toBe('sess-stale'); // a fresh id, not the stale one
  });

  it('reads the store once for an override (no redundant previous lookup)', async () => {
    const spy = vi
      .spyOn(sessionBuffer, 'getExistingSession')
      .mockResolvedValue(null);

    await getDeviceId({ ...BASE, overrideDeviceId: 'cookie-abc' });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({
      projectId: 'proj-1',
      deviceId: 'cookie-abc',
    });
  });

  it('checks both current and previous salt windows for internal ids', async () => {
    const spy = vi
      .spyOn(sessionBuffer, 'getExistingSession')
      .mockResolvedValue(null);

    await getDeviceId(BASE); // no override → IP+UA hashing

    expect(spy).toHaveBeenCalledTimes(2);
    const deviceIds = spy.mock.calls.map((c) =>
      'deviceId' in c[0] ? c[0].deviceId : ''
    );
    expect(new Set(deviceIds).size).toBe(2); // distinct current/previous hashes
  });
});
