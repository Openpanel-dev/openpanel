/**
 * Tests for createSessionEnd — the close job. Covers the three-case logic
 * (extended-after-enqueue skip, live vs snapshot, boundary), the first-writer
 * idempotency claim, and that cleanup() is id-gated to the closed session.
 */

import {
  createEvent,
  type IClickhouseSession,
  type IServiceCreateEventPayload,
  sessionBuffer,
} from '@openpanel/db';
import type { EventsQueuePayloadCreateSessionEnd } from '@openpanel/queue';
import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionEnd } from './events.create-session-end';

const { redisMock } = vi.hoisted(() => ({
  redisMock: { set: vi.fn() },
}));

vi.mock('@openpanel/redis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@openpanel/redis')>();
  return { ...actual, getRedisCache: () => redisMock };
});

vi.mock('@openpanel/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@openpanel/db')>();
  return {
    ...actual,
    createEvent: vi.fn().mockResolvedValue({ document: { id: 'evt-1' } }),
    getNotificationRulesByProjectId: vi.fn().mockResolvedValue([]),
    getHasFunnelRules: vi.fn().mockReturnValue(false),
    transformEvent: vi.fn((e) => e),
    sessionBuffer: { getExistingSession: vi.fn(), cleanup: vi.fn() },
  };
});

vi.mock('@/metrics', () => {
  const m = () => ({ inc: vi.fn(), observe: vi.fn(), set: vi.fn() });
  return {
    sessionDurationOnClose: m(),
    sessionEndsEmitted: m(),
    sessionEndsSkipped: m(),
    sessionEventsOnClose: m(),
  };
});

const getExistingSession = vi.mocked(sessionBuffer.getExistingSession);
const cleanup = vi.mocked(sessionBuffer.cleanup);
const createEventMock = vi.mocked(createEvent);

const snapshot: IClickhouseSession = {
  id: 'sess-1',
  project_id: 'proj-1',
  device_id: 'dev-1',
  profile_id: 'dev-1',
  created_at: '2026-06-08 10:30:00',
  ended_at: '2026-06-08 11:00:00',
  is_bounce: false,
  duration: 1_800_000,
  event_count: 3,
  screen_view_count: 5,
  exit_path: '/end',
} as unknown as IClickhouseSession;

const makeJob = (
  snap: IClickhouseSession
): Job<EventsQueuePayloadCreateSessionEnd> =>
  ({
    id: 'job-1',
    data: {
      type: 'createSessionEnd',
      payload: {
        projectId: 'proj-1',
        deviceId: 'dev-1',
        profileId: 'dev-1',
        name: 'session_end',
        properties: {},
      } as unknown as IServiceCreateEventPayload,
      snapshot: snap,
    },
  }) as unknown as Job<EventsQueuePayloadCreateSessionEnd>;

beforeEach(() => {
  vi.clearAllMocks();
  redisMock.set.mockResolvedValue('OK'); // claim acquired by default
  cleanup.mockResolvedValue(undefined as never);
  createEventMock.mockResolvedValue({ document: { id: 'evt-1' } } as never);
});

describe('createSessionEnd', () => {
  it('emits session_end and id-gated cleanup on the happy path', async () => {
    getExistingSession.mockResolvedValue(snapshot); // live == snapshot, unchanged

    await createSessionEnd(makeJob(snapshot));

    expect(createEventMock).toHaveBeenCalledTimes(1);
    expect(createEventMock.mock.calls[0]![0]).toMatchObject({
      name: 'session_end',
      sessionId: 'sess-1',
    });
    expect(cleanup).toHaveBeenCalledWith({
      projectId: 'proj-1',
      deviceId: 'dev-1',
      sessionId: 'sess-1',
      profileId: 'dev-1',
    });
  });

  it('skips when the session was extended after the close was enqueued', async () => {
    getExistingSession.mockResolvedValue({
      ...snapshot,
      ended_at: '2026-06-08 11:05:00', // later than snapshot → still active
    });

    const result = await createSessionEnd(makeJob(snapshot));

    expect(result).toBeNull();
    expect(createEventMock).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('skips when the idempotency claim is already taken', async () => {
    getExistingSession.mockResolvedValue(snapshot);
    redisMock.set.mockResolvedValue(null); // SET NX failed → already emitted

    const result = await createSessionEnd(makeJob(snapshot));

    expect(result).toBeNull();
    expect(createEventMock).not.toHaveBeenCalled();
  });

  it('uses the snapshot when a new session already owns the slot (boundary)', async () => {
    // A boundary opened a fresh session under the same (project, device) slot.
    getExistingSession.mockResolvedValue({
      ...snapshot,
      id: 'sess-2',
      ended_at: '2026-06-08 12:00:00',
    });

    await createSessionEnd(makeJob(snapshot));

    // Emits for the CLOSED session (snapshot), not the live one.
    expect(createEventMock.mock.calls[0]![0]).toMatchObject({
      sessionId: 'sess-1',
    });
    // cleanup is keyed on the closed id → id-gated Lua no-ops against sess-2.
    expect(cleanup).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'sess-1' })
    );
  });
});
