/**
 * Tests for:
 * - getOverrideDeviceId — the guard around a track event's caller-supplied
 *   `__deviceId` (it becomes a Redis key segment, a BullMQ jobId and a ClickHouse
 *   device_id, so it must be trimmed, non-empty, and length-bounded).
 * - handleReplay — replay files a chunk under the session id the SDK echoes back;
 *   it needs no device resolution and trusts the client-sent session id.
 */

import { replayBuffer } from '@openpanel/db';
import type {
  IReplayPayload,
  ITrackHandlerPayload,
} from '@openpanel/validation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getOverrideDeviceId, handleReplay } from './track.controller';

const track = (
  properties?: Record<string, unknown>
): ITrackHandlerPayload =>
  ({
    type: 'track',
    payload: { name: 'page_view', properties },
  }) as ITrackHandlerPayload;

describe('getOverrideDeviceId', () => {
  it('returns a trimmed device id', () => {
    expect(getOverrideDeviceId(track({ __deviceId: '  cookie-abc  ' }))).toBe(
      'cookie-abc'
    );
  });

  it('returns the device id as-is when already clean', () => {
    expect(getOverrideDeviceId(track({ __deviceId: 'cookie-abc' }))).toBe(
      'cookie-abc'
    );
  });

  it('ignores empty / whitespace-only values', () => {
    expect(getOverrideDeviceId(track({ __deviceId: '' }))).toBeUndefined();
    expect(getOverrideDeviceId(track({ __deviceId: '   ' }))).toBeUndefined();
  });

  it('ignores non-string values', () => {
    expect(getOverrideDeviceId(track({ __deviceId: 123 }))).toBeUndefined();
    expect(getOverrideDeviceId(track({}))).toBeUndefined();
    expect(getOverrideDeviceId(track(undefined))).toBeUndefined();
  });

  it('ignores pathologically long values (cap is 64)', () => {
    expect(
      getOverrideDeviceId(track({ __deviceId: 'x'.repeat(65) }))
    ).toBeUndefined();
    expect(getOverrideDeviceId(track({ __deviceId: 'x'.repeat(64) }))).toBe(
      'x'.repeat(64)
    );
  });

  it('returns undefined for non-track payload types', () => {
    expect(
      getOverrideDeviceId({
        type: 'identify',
        payload: { profileId: 'p1', properties: { __deviceId: 'cookie' } },
      } as ITrackHandlerPayload)
    ).toBeUndefined();
  });
});

const chunk = (): IReplayPayload => ({
  chunk_index: 0,
  events_count: 1,
  is_full_snapshot: true,
  started_at: '2026-06-08T12:00:00.000Z',
  ended_at: '2026-06-08T12:00:01.000Z',
  payload: '[]',
});

describe('handleReplay', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('files the chunk under the session id provided by the caller', async () => {
    const add = vi.spyOn(replayBuffer, 'add').mockResolvedValue(undefined);

    await handleReplay(chunk(), {
      projectId: 'proj-1',
      sessionId: 'sess-issued-123',
    });

    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: 'proj-1',
        session_id: 'sess-issued-123',
      })
    );
  });

  it('throws when the session id is missing', async () => {
    const add = vi.spyOn(replayBuffer, 'add').mockResolvedValue(undefined);

    await expect(
      handleReplay(chunk(), { projectId: 'proj-1', sessionId: undefined })
    ).rejects.toThrow('Session ID is required for replay');
    expect(add).not.toHaveBeenCalled();
  });
});
