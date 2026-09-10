/**
 * Tests for getDeviceId's session resolution against the device-keyed session
 * store. The id is reused from the live blob only while it's within the idle
 * window; a lingering (past-window) blob must NOT be reused — see the guard in
 * device-id.ts. Override device ids resolve through the same path with a
 * single read.
 *
 * Moved from apps/api/src/utils/ids.test.ts with M8-002. The buffer is now an
 * argument, so the stub replaces V1's spy on the module singleton — same
 * assertions, and no Redis either way.
 */

import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { IClickhouseSession } from '../../session/session.service';
import { formatClickhouseDate } from '../../session/src/dates';
import {
  getDeviceId,
  type SessionBufferReader,
  type SessionResolutionLogger,
} from './device-id';

const NOW = new Date('2026-06-08T12:00:00.000Z').getTime();
const MINUTE = 60 * 1000;
const SALTS = { current: 'salt-current', previous: 'salt-previous' };
/** SESSION_TIMEOUT_MS's default: the caller resolves it from config now. */
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/** The caller's request logger. Inputs here are an IP and a salt, so a
 *  session-read failure must go through pino's redaction, not `console`. */
const stubLogger = () => {
  const error = mock((_details: unknown, _message?: string) => undefined);
  return { error, logger: { error } as unknown as SessionResolutionLogger };
};

const BASE = {
  projectId: 'proj-1',
  ip: '1.2.3.4',
  ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/148.0.0.0',
  salts: SALTS,
  eventTimeMs: NOW,
  sessionTimeoutMs: SESSION_TIMEOUT_MS,
  logger: stubLogger().logger,
};

// withinIdleWindow only reads `id` + `ended_at`; the rest is irrelevant here.
const fakeSession = (id: string, endedAtMs: number): IClickhouseSession =>
  ({
    id,
    ended_at: formatClickhouseDate(new Date(endedAtMs)),
  }) as unknown as IClickhouseSession;

function stubBuffer(session: IClickhouseSession | null) {
  const getExistingSession = mock(async () => session);
  return {
    getExistingSession,
    buffer: { getExistingSession } as unknown as SessionBufferReader,
  };
}

afterEach(() => {
  mock.restore();
});

describe('getDeviceId — session resolution', () => {
  it('mints a deterministic, stable id when no session exists', async () => {
    const { getExistingSession, buffer } = stubBuffer(null);

    const a = await getDeviceId({
      ...BASE,
      overrideDeviceId: 'cookie-abc',
      sessionBuffer: buffer,
    });
    const b = await getDeviceId({
      ...BASE,
      overrideDeviceId: 'cookie-abc',
      sessionBuffer: buffer,
    });

    expect(a.sessionId).toBeTruthy();
    expect(b.sessionId).toBe(a.sessionId); // same window → same id
    expect(a.deviceId).toBe('cookie-abc');
    expect(getExistingSession).toHaveBeenCalled();
  });

  it('reuses the live session id when within the idle window', async () => {
    const { buffer } = stubBuffer(fakeSession('sess-live', NOW - MINUTE));

    const result = await getDeviceId({
      ...BASE,
      overrideDeviceId: 'cookie-abc',
      sessionBuffer: buffer,
    });

    expect(result).toEqual({ deviceId: 'cookie-abc', sessionId: 'sess-live' });
  });

  it('does NOT reuse a session that has lingered past the idle window', async () => {
    // ended 31 min ago — past the 30 min timeout; the reaper just hasn't
    // closed it yet (blobs have no TTL).
    const { buffer } = stubBuffer(fakeSession('sess-stale', NOW - 31 * MINUTE));

    const result = await getDeviceId({
      ...BASE,
      overrideDeviceId: 'cookie-abc',
      sessionBuffer: buffer,
    });

    expect(result.deviceId).toBe('cookie-abc');
    expect(result.sessionId).toBeTruthy();
    expect(result.sessionId).not.toBe('sess-stale'); // a fresh id, not the stale one
  });

  it('reads the store once for an override (no redundant previous lookup)', async () => {
    const { getExistingSession, buffer } = stubBuffer(null);

    await getDeviceId({
      ...BASE,
      overrideDeviceId: 'cookie-abc',
      sessionBuffer: buffer,
    });

    expect(getExistingSession).toHaveBeenCalledTimes(1);
    expect(getExistingSession).toHaveBeenCalledWith({
      projectId: 'proj-1',
      deviceId: 'cookie-abc',
    });
  });

  it('checks both current and previous salt windows for internal ids', async () => {
    const { getExistingSession, buffer } = stubBuffer(null);

    await getDeviceId({ ...BASE, sessionBuffer: buffer }); // no override → IP+UA hashing

    expect(getExistingSession).toHaveBeenCalledTimes(2);
    const deviceIds = getExistingSession.mock.calls.map((call) => {
      const [args] = call as unknown as [{ deviceId?: string }];
      return args.deviceId ?? '';
    });
    expect(new Set(deviceIds).size).toBe(2); // distinct current/previous hashes
  });

  it('logs a failed session read through the caller logger, not console', async () => {
    const { error, logger } = stubLogger();
    const failing = {
      getExistingSession: mock(() => {
        throw new Error('session store unavailable');
      }),
    } as unknown as SessionBufferReader;

    const result = await getDeviceId({
      ...BASE,
      logger,
      overrideDeviceId: 'cookie-abc',
      sessionBuffer: failing,
    });

    expect(error).toHaveBeenCalledTimes(1);
    // Still answers with a deterministic id: the read is best-effort.
    expect(result.deviceId).toBe('cookie-abc');
    expect(result.sessionId).not.toBe('');
  });
});
