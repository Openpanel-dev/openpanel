/**
 * Tests for:
 * - getOverrideDeviceId — the guard around a track event's caller-supplied
 *   `__deviceId` (it becomes a Redis key segment, a BullMQ jobId and a ClickHouse
 *   device_id, so it must be trimmed, non-empty, and length-bounded).
 * - handleReplay — replay files a chunk under the session id the SDK echoes back;
 *   it needs no device resolution and trusts the client-sent session id.
 * - handler — the single events transport (ADR-004): every tracked event goes to
 *   Kafka via produceIncomingEvent, with no branch and no fallback queue.
 *
 * `@openpanel/db` and `@openpanel/queue` are partially mocked (importActual +
 * overrides) rather than replaced: they import each other, and the replay test
 * below spies on the real `replayBuffer`.
 */

import {
  getSalts,
  replayBuffer,
  sessionBuffer,
  upsertProfile,
} from '@openpanel/db';
import { getAsnInfo, getGeoLocation } from '@openpanel/geo';
import { produceIncomingEvent } from '@openpanel/queue';
import type {
  IReplayPayload,
  ITrackHandlerPayload,
} from '@openpanel/validation';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getOverrideDeviceId, handleReplay, handler } from './track.controller';

vi.mock('@openpanel/queue', async () => {
  const actual =
    await vi.importActual<typeof import('@openpanel/queue')>(
      '@openpanel/queue'
    );
  return { ...actual, produceIncomingEvent: vi.fn() };
});

vi.mock('@openpanel/geo', () => ({
  getGeoLocation: vi.fn(),
  getAsnInfo: vi.fn(),
}));

vi.mock('@openpanel/db', async () => {
  const actual =
    await vi.importActual<typeof import('@openpanel/db')>('@openpanel/db');
  return { ...actual, getSalts: vi.fn(), upsertProfile: vi.fn() };
});

const track = (properties?: Record<string, unknown>): ITrackHandlerPayload =>
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

const PROJECT_ID = 'proj-kafka';
const DEVICE_ID = 'device-kafka-1';

const makeRequest = (body: ITrackHandlerPayload) =>
  ({
    body,
    client: { projectId: PROJECT_ID },
    clientIp: '1.2.3.4',
    clientSecretAuth: false,
    timestamp: new Date('2026-06-08T12:00:00.000Z').getTime(),
    headers: { 'user-agent': 'Mozilla/5.0 (Macintosh) Chrome/148.0.0.0' },
  }) as unknown as FastifyRequest<{ Body: ITrackHandlerPayload }>;

const makeReply = () => {
  const reply = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      reply.statusCode = code;
      return reply;
    },
    send(payload: unknown) {
      reply.body = payload;
      return reply;
    },
  };
  return reply as unknown as FastifyReply & typeof reply;
};

describe('handler — events transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSalts).mockResolvedValue({
      current: 'salt-current',
      previous: 'salt-previous',
    });
    vi.mocked(getGeoLocation).mockResolvedValue({
      country: 'SE',
      city: 'Stockholm',
      region: 'AB',
      longitude: 18,
      latitude: 59,
    });
    vi.mocked(getAsnInfo).mockResolvedValue({
      asn: undefined,
      org: undefined,
      isHosting: false,
    });
    vi.mocked(produceIncomingEvent).mockResolvedValue(undefined);
    vi.spyOn(sessionBuffer, 'getExistingSession').mockResolvedValue(null);
  });

  it('produces every tracked event to Kafka — the only transport', async () => {
    await handler(
      makeRequest({
        type: 'track',
        payload: {
          name: 'page_view',
          properties: { __deviceId: DEVICE_ID },
        },
      } as ITrackHandlerPayload),
      makeReply()
    );

    expect(produceIncomingEvent).toHaveBeenCalledTimes(1);
    const [queueData, partitionKey] =
      vi.mocked(produceIncomingEvent).mock.calls[0]!;
    expect(queueData).toMatchObject({
      projectId: PROJECT_ID,
      deviceId: DEVICE_ID,
      event: { name: 'page_view' },
    });
    // Browser events partition on the device id, which is what preserves
    // per-device mutual exclusion in the consumer.
    expect(partitionKey).toBe(DEVICE_ID);
  });

  it('surfaces a produce failure instead of falling back to another queue', async () => {
    vi.mocked(produceIncomingEvent).mockRejectedValue(
      new Error('kafka unavailable')
    );

    await expect(
      handler(
        makeRequest({
          type: 'track',
          payload: { name: 'page_view', properties: { __deviceId: DEVICE_ID } },
        } as ITrackHandlerPayload),
        makeReply()
      )
    ).rejects.toThrow('kafka unavailable');

    expect(produceIncomingEvent).toHaveBeenCalledTimes(1);
  });

  it('does not produce for non-event payload types', async () => {
    vi.mocked(upsertProfile).mockResolvedValue(undefined as never);

    await handler(
      makeRequest({
        type: 'identify',
        payload: { profileId: 'p1', properties: {} },
      } as ITrackHandlerPayload),
      makeReply()
    );

    expect(produceIncomingEvent).not.toHaveBeenCalled();
  });
});
