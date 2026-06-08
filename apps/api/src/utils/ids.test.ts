/**
 * Tests for getDeviceId — specifically the caller-supplied (override) device id
 * path. The override must resolve a real, stable sessionId through the same
 * `getInfoFromSession` logic internal device ids use, so sessions open/extend/close
 * identically. Returning an empty sessionId here is the bug that left sessions
 * unbuffered and made the createSessionEnd job throw "Session not found".
 *
 * Redis is mocked: we drive `multi().exec()` to simulate "an active sessionEnd job
 * exists" vs "no active job" without a real connection.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { execMock } = vi.hoisted(() => ({ execMock: vi.fn() }));

vi.mock('@openpanel/redis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@openpanel/redis')>();
  return {
    ...actual,
    getRedisCache: () => ({
      multi: () => {
        const chain = {
          hget: () => chain,
          exec: execMock,
        };
        return chain;
      },
    }),
  };
});

const { getDeviceId } = await import('./ids');

const SALTS = { current: 'salt-current', previous: 'salt-previous' };
const BASE = {
  projectId: 'proj-1',
  ip: '1.2.3.4',
  ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/148.0.0.0',
  salts: SALTS,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-08T12:00:00.000Z'));
  execMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getDeviceId — override device id', () => {
  it('derives a non-empty, deterministic sessionId when no active session exists', async () => {
    execMock.mockResolvedValue([
      [null, null],
      [null, null],
    ]);

    const result = await getDeviceId({
      ...BASE,
      overrideDeviceId: 'cookie-abc',
    });

    expect(result.deviceId).toBe('cookie-abc');
    expect(result.sessionId).toBeTruthy();

    // Same override within the same time window → same session id (stable).
    const again = await getDeviceId({
      ...BASE,
      overrideDeviceId: 'cookie-abc',
    });
    expect(again.sessionId).toBe(result.sessionId);
  });

  it('reuses the sessionId from an active sessionEnd job instead of splitting', async () => {
    execMock.mockResolvedValue([
      [
        null,
        JSON.stringify({
          payload: {
            projectId: 'proj-1',
            deviceId: 'cookie-abc',
            sessionId: 'sess-active-123',
          },
        }),
      ],
      [null, null],
    ]);

    const result = await getDeviceId({
      ...BASE,
      overrideDeviceId: 'cookie-abc',
    });

    expect(result.deviceId).toBe('cookie-abc');
    expect(result.sessionId).toBe('sess-active-123');
  });

  it('produces distinct session ids for distinct override device ids', async () => {
    execMock.mockResolvedValue([
      [null, null],
      [null, null],
    ]);

    const a = await getDeviceId({ ...BASE, overrideDeviceId: 'cookie-a' });
    const b = await getDeviceId({ ...BASE, overrideDeviceId: 'cookie-b' });

    expect(a.sessionId).toBeTruthy();
    expect(b.sessionId).toBeTruthy();
    expect(a.sessionId).not.toBe(b.sessionId);
  });
});
