/**
 * Tests for: - getOverrideDeviceId — the guard around a track event's
 * caller-supplied `__deviceId` (it becomes a Redis key segment, a BullMQ jobId
 * and a ClickHouse device_id, so it must be trimmed, non-empty, and
 * length-bounded). - handleReplay — replay files a chunk under the session id
 * the SDK echoes back; it needs no device resolution and trusts the client-sent
 * session id. - ingestTrack — the single events transport: every tracked event
 * goes to Kafka via the injected producer, with no branch and no fallback
 * queue.
 *
 * Geo/ASN and the salts are still module-level, so those keep a
 * `mock.module` (unhoisted, hence the `await import` in `beforeAll`).
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from 'bun:test';
import { testCoreConfig } from '../../../test/config-fixture';
import type { Buffers } from '../../buffers/create-buffers';
import type { GeoLocation } from '../../clients/geo';
import type { IReplayPayload, ITrackHandlerPayload } from './ingest.constants';

const getGeoLocation = mock(
  async (): Promise<GeoLocation> => ({
    country: 'SE',
    city: 'Stockholm',
    region: 'AB',
    longitude: 18,
    latitude: 59,
  })
);
const getAsnInfo = mock(async () => ({
  asn: undefined,
  org: undefined,
  isHosting: false,
}));
const getSalts = mock(async (_deps: unknown) => ({
  current: 'salt-current',
  previous: 'salt-previous',
}));
const identifyProfile = mock(async () => undefined);
const upsertProfile = mock(async () => undefined);
const getProfileById = mock(async () => null);

mock.module('../../clients/geo', () => ({ getGeoLocation, getAsnInfo }));

let getOverrideDeviceId: typeof import('./ingest.service').getOverrideDeviceId;
let getTimestamp: typeof import('./ingest.service').getTimestamp;
let handleReplay: typeof import('./ingest.service').handleReplay;
let ingestTrack: typeof import('./ingest.service').ingestTrack;

// The profile module is spread and then overridden by name: event.service
// imports more of profile.service than ingest.service does. Overriding
// `identifyProfile` (not just `upsertProfile`) is what keeps the identify path
// off Postgres and the profile buffer — profile.service calls its own local
// `upsertProfile`, not the exported binding.
//
// Ingest.service.ts calls salt.service.ts's module-scope `getSalts` with the
// scope it holds, so that is the specifier mocked here, spread-actual like the
// rest.
let realSaltService: typeof import('../salt/salt.service');
beforeAll(async () => {
  const profile = await import('../profile/profile.service');
  mock.module('../profile/profile.service', () => ({
    ...profile,
    identifyProfile,
    upsertProfile,
    getProfileById,
  }));
  realSaltService = { ...(await import('../salt/salt.service')) };
  mock.module('../salt/salt.service', () => ({
    ...realSaltService,
    getSalts,
  }));
  ({ getOverrideDeviceId, getTimestamp, handleReplay, ingestTrack } =
    await import('./ingest.service'));
});

afterAll(() => {
  mock.module('../salt/salt.service', () => realSaltService);
});

const track = (properties?: Record<string, unknown>): ITrackHandlerPayload =>
  ({
    type: 'track',
    payload: { name: 'page_view', properties },
  }) as ITrackHandlerPayload;

// Back-dating is documented and deliberate, so the guard here is a FLOOR, not
// a window: historical imports must keep working, and only values that cannot
// be a real event time fall back to the server clock (ISSUES.md H6).
describe('getTimestamp', () => {
  const ARRIVED_AT = Date.UTC(2026, 8, 27, 12, 0, 0);
  const withTimestamp = (value: unknown) =>
    getTimestamp(ARRIVED_AT, track({ __timestamp: value }).payload);

  it('keeps an old but plausible timestamp, so imports still work', () => {
    const result = withTimestamp('2020-01-01T00:00:00.000Z');
    expect(result.timestamp).toBe(Date.UTC(2020, 0, 1));
    expect(result.isTimestampFromThePast).toBe(true);
  });

  it('keeps a real epoch-millisecond value', () => {
    const epochMs = Date.UTC(2024, 0, 15, 10, 30, 0);
    expect(withTimestamp(epochMs).timestamp).toBe(epochMs);
  });

  it('falls back to the server clock for a value that lands in 1970', () => {
    // `new Date(12345)` is 1970-01-01T00:00:12.345Z. One such row reached
    // ClickHouse during the QA run and every WITH FILL series then began there.
    expect(withTimestamp(12_345).timestamp).toBe(ARRIVED_AT);
    expect(withTimestamp(0).timestamp).toBe(ARRIVED_AT);
  });

  it('still falls back for garbage and for the future', () => {
    expect(withTimestamp('not a date').timestamp).toBe(ARRIVED_AT);
    expect(withTimestamp(ARRIVED_AT + 10 * 60 * 1000).timestamp).toBe(
      ARRIVED_AT
    );
  });

  it('leaves a recent timestamp alone', () => {
    const recent = ARRIVED_AT - 60 * 1000;
    const result = withTimestamp(new Date(recent).toISOString());
    expect(result.timestamp).toBe(recent);
    expect(result.isTimestampFromThePast).toBe(false);
  });
});

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
  it('files the chunk under the session id provided by the caller', async () => {
    const add = mock((_row: Record<string, unknown>) => Promise.resolve());

    const failure = await handleReplay(
      chunk(),
      { projectId: 'proj-1', sessionId: 'sess-issued-123' },
      { add } as unknown as Buffers['replay']
    );

    expect(failure).toBeNull();
    expect(add).toHaveBeenCalledTimes(1);
    expect(add.mock.calls[0]?.[0]).toMatchObject({
      project_id: 'proj-1',
      session_id: 'sess-issued-123',
    });
  });

  it('refuses the chunk when the session id is missing', async () => {
    const add = mock(async () => undefined);

    const failure = await handleReplay(
      chunk(),
      { projectId: 'proj-1', sessionId: undefined },
      { add } as unknown as Buffers['replay']
    );

    expect(failure).toEqual({ status: 'replay-missing-session-id' });
    expect(add).not.toHaveBeenCalled();
  });
});

const PROJECT_ID = 'proj-kafka';
const DEVICE_ID = 'device-kafka-1';

const getExistingSession = mock(async () => null);

const transport = (
  produceIncomingEvent: ReturnType<typeof mock>
): Parameters<typeof ingestTrack>[1] =>
  ({
    buffers: {
      session: { getExistingSession },
      replay: { add: mock(async () => undefined) },
      group: { add: mock(async () => undefined) },
    },
    produceIncomingEvent,
    deps: { buffers: {}, config: testCoreConfig() },
  }) as unknown as Parameters<typeof ingestTrack>[1];

const request = (body: ITrackHandlerPayload) => ({
  projectId: PROJECT_ID,
  clientIp: '1.2.3.4',
  clientSecretAuth: false,
  timestamp: new Date('2026-06-08T12:00:00.000Z').getTime(),
  headers: { 'user-agent': 'Mozilla/5.0 (Macintosh) Chrome/148.0.0.0' },
  body,
});

describe('ingestTrack — events transport', () => {
  beforeEach(() => {
    getExistingSession.mockClear();
    identifyProfile.mockClear();
  });

  it('produces every tracked event to Kafka — the only transport', async () => {
    const produce = mock(async () => undefined);

    await ingestTrack(
      request({
        type: 'track',
        payload: { name: 'page_view', properties: { __deviceId: DEVICE_ID } },
      } as ITrackHandlerPayload),
      transport(produce)
    );

    expect(produce).toHaveBeenCalledTimes(1);
    const [queueData, partitionKey] = produce.mock.calls[0] as unknown as [
      Record<string, unknown>,
      string,
    ];
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
    const produce = mock(() => Promise.reject(new Error('kafka unavailable')));

    await expect(
      ingestTrack(
        request({
          type: 'track',
          payload: { name: 'page_view', properties: { __deviceId: DEVICE_ID } },
        } as ITrackHandlerPayload),
        transport(produce)
      )
    ).rejects.toThrow('kafka unavailable');

    expect(produce).toHaveBeenCalledTimes(1);
  });

  it('does not produce for non-event payload types', async () => {
    const produce = mock(async () => undefined);

    await ingestTrack(
      request({
        type: 'identify',
        payload: { profileId: 'p1', properties: {} },
      } as ITrackHandlerPayload),
      transport(produce)
    );

    expect(produce).not.toHaveBeenCalled();
    expect(identifyProfile).toHaveBeenCalledTimes(1);
  });
});
