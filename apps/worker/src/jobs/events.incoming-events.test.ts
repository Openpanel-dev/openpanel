import {
  createEvent,
  formatClickhouseDate,
  type IClickhouseSession,
  sessionBuffer,
} from '@openpanel/db';
import {
  type EventsQueuePayloadIncomingEvent,
  sessionsQueue,
} from '@openpanel/queue';
import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { incomingEvent } from './events.incoming-event';

vi.mock('@openpanel/queue');
vi.mock('@openpanel/db', async () => {
  const actual = await vi.importActual('@openpanel/db');
  return {
    ...actual,
    createEvent: vi.fn(),
    checkNotificationRulesForEvent: vi.fn().mockResolvedValue(true),
    getProjectByIdCached: vi.fn().mockResolvedValue({ filters: [] }),
    matchEvent: vi.fn().mockReturnValue(false),
    sessionBuffer: {
      // name/getBufferSize keep metrics.ts happy (it registers a per-buffer
      // gauge at import); the tests only drive getExistingSession/ingest.
      name: 'session',
      getBufferSize: vi.fn().mockResolvedValue(0),
      getExistingSession: vi.fn(),
      ingest: vi.fn(),
    },
  };
});

const projectId = 'test-project';
const deviceId = 'device-123';
const newSessionId = 'a1b2c3d4-e5f6-4789-a012-345678901234';
const geo = {
  country: 'US',
  city: 'New York',
  region: 'NY',
  longitude: 0,
  latitude: 0,
};

const uaInfo: EventsQueuePayloadIncomingEvent['payload']['uaInfo'] = {
  isServer: false,
  device: 'desktop',
  os: 'Windows',
  osVersion: '10',
  browser: 'Chrome',
  browserVersion: '91.0.4472.124',
  brand: '',
  model: '',
};

const uaInfoServer: EventsQueuePayloadIncomingEvent['payload']['uaInfo'] = {
  isServer: true,
  device: 'server',
  os: '',
  osVersion: '',
  browser: '',
  browserVersion: '',
  brand: '',
  model: '',
};

function makeSession(
  overrides: Partial<IClickhouseSession> = {}
): IClickhouseSession {
  const now = new Date();
  return {
    id: 'session-existing',
    project_id: projectId,
    device_id: deviceId,
    profile_id: '',
    event_count: 1,
    screen_view_count: 0,
    entry_path: '/',
    entry_origin: 'https://example.com',
    exit_path: '/',
    exit_origin: 'https://example.com',
    created_at: formatClickhouseDate(now),
    ended_at: formatClickhouseDate(now),
    os: 'Windows',
    os_version: '10',
    browser: 'Chrome',
    browser_version: '91.0.4472.124',
    device: 'desktop',
    brand: '',
    model: '',
    country: 'US',
    region: 'NY',
    city: 'New York',
    longitude: 0,
    latitude: 0,
    duration: 0,
    referrer: '',
    referrer_name: '',
    referrer_type: '',
    is_bounce: true,
    utm_term: '',
    utm_source: '',
    utm_campaign: '',
    utm_content: '',
    utm_medium: '',
    revenue: 0,
    sign: 1,
    version: 1,
    groups: [],
    ...overrides,
  } satisfies IClickhouseSession;
}

function buildJobData(
  overrides: Partial<EventsQueuePayloadIncomingEvent['payload']> = {}
): EventsQueuePayloadIncomingEvent['payload'] {
  return {
    geo,
    event: {
      name: 'test_event',
      timestamp: new Date().toISOString(),
      isTimestampFromThePast: false,
      properties: { __path: 'https://example.com/test' },
    },
    uaInfo,
    headers: {
      'request-id': '123',
      'user-agent': 'Mozilla/5.0',
      'openpanel-sdk-name': 'web',
      'openpanel-sdk-version': '1.0.0',
    },
    projectId,
    deviceId,
    sessionId: newSessionId,
    ...overrides,
  };
}

describe('incomingEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (createEvent as Mock).mockImplementation((event) => event);
  });

  it('emits session_start when ingest returns kind="new"', async () => {
    vi.mocked(sessionBuffer.ingest).mockResolvedValueOnce({
      kind: 'new',
      current: makeSession({ id: newSessionId }),
    });

    await incomingEvent(buildJobData());

    expect(sessionsQueue.add).not.toHaveBeenCalled();
    const calls = (createEvent as Mock).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]![0].name).toBe('session_start');
    expect(calls[1]![0].name).toBe('test_event');
  });

  it('skips session_start when ingest returns kind="extend"', async () => {
    vi.mocked(sessionBuffer.ingest).mockResolvedValueOnce({
      kind: 'extend',
      current: makeSession(),
    });

    await incomingEvent(buildJobData());

    expect(sessionsQueue.add).not.toHaveBeenCalled();
    const sessionStartCalls = (createEvent as Mock).mock.calls.filter(
      ([arg]) => arg?.name === 'session_start'
    );
    expect(sessionStartCalls).toHaveLength(0);
  });

  it('closes old session and emits session_start when ingest returns kind="boundary"', async () => {
    const closed = makeSession({ id: 'old-session-id' });
    const current = makeSession({ id: newSessionId });
    vi.mocked(sessionBuffer.ingest).mockResolvedValueOnce({
      kind: 'boundary',
      current,
      closed,
    });

    const spy = vi
      .spyOn(sessionsQueue, 'add')
      .mockResolvedValue({} as Job);

    await incomingEvent(buildJobData());

    expect(spy).toHaveBeenCalledTimes(1);
    const [, payload, opts] = spy.mock.calls[0]!;
    expect((payload as any).type).toBe('createSessionEnd');
    expect((payload as any).payload.sessionId).toBe('old-session-id');
    expect((payload as any).snapshot.id).toBe('old-session-id');
    expect(opts?.jobId).toBe('sessionEnd:v2:old-session-id');

    const calls = (createEvent as Mock).mock.calls;
    expect(calls.filter(([a]) => a?.name === 'session_start')).toHaveLength(1);
    expect(calls.filter(([a]) => a?.name === 'test_event')).toHaveLength(1);
  });

  it('inherits referrer from current session on the actual event', async () => {
    vi.mocked(sessionBuffer.ingest).mockResolvedValueOnce({
      kind: 'extend',
      current: makeSession({
        referrer: 'https://google.com',
        referrer_name: 'Google',
        referrer_type: 'search',
      }),
    });

    await incomingEvent(buildJobData());

    const testEventCall = (createEvent as Mock).mock.calls.find(
      ([a]) => a?.name === 'test_event'
    );
    expect(testEventCall![0].referrer).toBe('https://google.com');
    expect(testEventCall![0].referrerName).toBe('Google');
    expect(testEventCall![0].referrerType).toBe('search');
  });

  it('handles server events with existing profile session', async () => {
    const timestamp = new Date();
    const jobData = buildJobData({
      event: {
        name: 'server_event',
        timestamp: timestamp.toISOString(),
        properties: { custom_property: 'test_value' },
        profileId: 'profile-123',
        isTimestampFromThePast: false,
      },
      uaInfo: uaInfoServer,
      deviceId: '',
      sessionId: '',
      headers: {
        'user-agent': 'OpenPanel Server/1.0',
        'openpanel-sdk-name': 'server',
        'openpanel-sdk-version': '1.0.0',
        'request-id': '123',
      },
    });

    vi.mocked(sessionBuffer.getExistingSession).mockResolvedValueOnce(
      makeSession({
        id: 'last-session-456',
        device_id: 'last-device-123',
        profile_id: 'profile-123',
        os: 'iOS',
        os_version: '15.0',
        browser: 'Safari',
        browser_version: '15.0',
        device: 'mobile',
        brand: 'Apple',
        model: 'iPhone',
        country: 'CA',
        region: 'ON',
        city: 'Toronto',
        entry_path: '/last-path',
        entry_origin: 'https://example.com',
        exit_path: '/last-path',
        exit_origin: 'https://example.com',
        referrer: 'https://google.com',
        referrer_name: 'Google',
        referrer_type: 'search',
        is_bounce: false,
        event_count: 0,
        screen_view_count: 0,
      })
    );

    await incomingEvent(jobData);

    expect(sessionBuffer.ingest).not.toHaveBeenCalled();
    expect(sessionsQueue.add).not.toHaveBeenCalled();
    expect((createEvent as Mock).mock.calls[0]![0]).toMatchObject({
      name: 'server_event',
      deviceId: 'last-device-123',
      sessionId: 'last-session-456',
      profileId: 'profile-123',
      city: 'Toronto',
      country: 'CA',
      referrer: 'https://google.com',
    });
  });

  it('handles server events without any active session', async () => {
    vi.mocked(sessionBuffer.getExistingSession).mockResolvedValueOnce(null);

    await incomingEvent(
      buildJobData({
        event: {
          name: 'server_event',
          timestamp: new Date().toISOString(),
          properties: { custom_property: 'test_value' },
          profileId: 'profile-123',
          isTimestampFromThePast: false,
        },
        uaInfo: uaInfoServer,
        deviceId: '',
        sessionId: '',
        headers: {
          'user-agent': 'OpenPanel Server/1.0',
          'openpanel-sdk-name': 'server',
          'openpanel-sdk-version': '1.0.0',
          'request-id': '123',
        },
      })
    );

    expect(sessionBuffer.ingest).not.toHaveBeenCalled();
    expect(sessionsQueue.add).not.toHaveBeenCalled();
    expect((createEvent as Mock).mock.calls[0]![0]).toMatchObject({
      name: 'server_event',
      deviceId: '',
      sessionId: '',
      profileId: 'profile-123',
    });
  });

  it('emits session_start only once across 3 rapid events (new → extend → extend)', async () => {
    const session = makeSession({ id: newSessionId });
    vi.mocked(sessionBuffer.ingest)
      .mockResolvedValueOnce({ kind: 'new', current: session })
      .mockResolvedValueOnce({ kind: 'extend', current: session })
      .mockResolvedValueOnce({ kind: 'extend', current: session });

    await incomingEvent(buildJobData({ event: { name: 'e1', timestamp: new Date().toISOString(), isTimestampFromThePast: false, properties: { __path: 'https://example.com/test' } } }));
    await incomingEvent(buildJobData({ event: { name: 'e2', timestamp: new Date().toISOString(), isTimestampFromThePast: false, properties: { __path: 'https://example.com/test' } } }));
    await incomingEvent(buildJobData({ event: { name: 'e3', timestamp: new Date().toISOString(), isTimestampFromThePast: false, properties: { __path: 'https://example.com/test' } } }));

    const sessionStartCalls = (createEvent as Mock).mock.calls.filter(
      ([a]) => a?.name === 'session_start'
    );
    expect(sessionStartCalls).toHaveLength(1);
    expect(sessionsQueue.add).not.toHaveBeenCalled();
  });
});
