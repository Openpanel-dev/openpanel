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
      getExistingSession: vi.fn(),
    },
  };
});
// Mock the session_start dedup lock so tests don't need a live Redis. By
// default the lock is acquired (true) so existing tests' session_start
// expectations still hold; individual tests can override per-call.
vi.mock('@openpanel/redis', async () => {
  const actual = await vi.importActual('@openpanel/redis');
  return {
    ...actual,
    getLock: vi.fn().mockResolvedValue(true),
  };
});

// 30 minutes
const SESSION_TIMEOUT = 30 * 60 * 1000;
const projectId = 'test-project';
const deviceId = 'device-123';
// Valid UUID used when creating a new session in tests
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

describe('incomingEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a session start and an event', async () => {
    const spySessionsQueueAdd = vi
      .spyOn(sessionsQueue, 'add')
      .mockResolvedValue({} as Job);
    const timestamp = new Date();
    // Mock job data
    const jobData: EventsQueuePayloadIncomingEvent['payload'] = {
      geo,
      event: {
        name: 'test_event',
        timestamp: timestamp.toISOString(),
        properties: { __path: 'https://example.com/test' },
      },
      uaInfo,
      headers: {
        'request-id': '123',
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'openpanel-sdk-name': 'web',
        'openpanel-sdk-version': '1.0.0',
      },
      projectId,
      deviceId,
      sessionId: newSessionId,
    };
    const event = {
      name: 'test_event',
      deviceId,
      profileId: '',
      sessionId: expect.stringMatching(
        // biome-ignore lint/performance/useTopLevelRegex: test
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      ),
      projectId,
      properties: {
        __hash: undefined,
        __query: undefined,
      },
      createdAt: timestamp,
      country: 'US',
      city: 'New York',
      region: 'NY',
      revenue: undefined,
      longitude: 0,
      latitude: 0,
      os: 'Windows',
      osVersion: '10',
      browser: 'Chrome',
      browserVersion: '91.0.4472.124',
      device: 'desktop',
      brand: '',
      model: '',
      duration: 0,
      path: '/test',
      origin: 'https://example.com',
      referrer: '',
      referrerName: '',
      referrerType: '',
      sdkName: jobData.headers['openpanel-sdk-name'],
      sdkVersion: jobData.headers['openpanel-sdk-version'],
      groups: [],
    };

    (createEvent as Mock).mockReturnValue(event);

    // Execute the job
    await incomingEvent(jobData);

    expect(spySessionsQueueAdd).toHaveBeenCalledWith(
      'session',
      {
        type: 'createSessionEnd',
        payload: expect.objectContaining(event),
      },
      {
        delay: SESSION_TIMEOUT,
        jobId: `sessionEnd:${projectId}:${deviceId}`,
        attempts: 3,
        backoff: {
          delay: 200,
          type: 'exponential',
        },
      }
    );

    expect((createEvent as Mock).mock.calls[0]![0]).toStrictEqual({
      ...event,
      createdAt: new Date(timestamp.getTime() - 100),
      name: 'session_start',
    });
    expect((createEvent as Mock).mock.calls[1]).toMatchObject([event]);
  });

  it('should reuse existing session', async () => {
    const spySessionsQueueAdd = vi.spyOn(sessionsQueue, 'add');
    const spySessionsQueueGetJob = vi.spyOn(sessionsQueue, 'getJob');

    const timestamp = new Date();
    // Mock job data
    const jobData: EventsQueuePayloadIncomingEvent['payload'] = {
      geo,
      event: {
        name: 'test_event',
        timestamp: timestamp.toISOString(),
        properties: { __path: 'https://example.com/test' },
      },
      headers: {
        'request-id': '123',
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'openpanel-sdk-name': 'web',
        'openpanel-sdk-version': '1.0.0',
      },
      uaInfo,
      projectId,
      deviceId,
      sessionId: 'session-123',
    };

    const changeDelay = vi.fn();
    const updateData = vi.fn();
    spySessionsQueueGetJob.mockResolvedValueOnce({
      getState: vi.fn().mockResolvedValue('delayed'),
      updateData,
      changeDelay,
      data: {
        type: 'createSessionEnd',
        payload: {
          sessionId: 'session-123',
          deviceId,
        },
      },
    } as Partial<Job> as Job);
    // Execute the job
    await incomingEvent(jobData);

    const event = {
      name: 'test_event',
      deviceId,
      profileId: '',
      sessionId: 'session-123',
      projectId,
      properties: {
        __hash: undefined,
        __query: undefined,
      },
      createdAt: timestamp,
      country: 'US',
      city: 'New York',
      region: 'NY',
      revenue: undefined,
      longitude: 0,
      latitude: 0,
      os: 'Windows',
      osVersion: '10',
      browser: 'Chrome',
      browserVersion: '91.0.4472.124',
      device: 'desktop',
      brand: '',
      model: '',
      duration: 0,
      path: '/test',
      origin: 'https://example.com',
      referrer: '',
      referrerName: '',
      referrerType: '',
      sdkName: jobData.headers['openpanel-sdk-name'],
      sdkVersion: jobData.headers['openpanel-sdk-version'],
      groups: [],
    };

    expect(spySessionsQueueAdd).toHaveBeenCalledTimes(0);
    expect(changeDelay).toHaveBeenCalledWith(SESSION_TIMEOUT);
    expect(createEvent as Mock).toBeCalledTimes(1);
    expect((createEvent as Mock).mock.calls[0]![0]).toStrictEqual(event);
  });

  it('should handle server events (with existing screen view)', async () => {
    const timestamp = new Date();
    const jobData: EventsQueuePayloadIncomingEvent['payload'] = {
      geo,
      event: {
        name: 'server_event',
        timestamp: timestamp.toISOString(),
        properties: { custom_property: 'test_value' },
        profileId: 'profile-123',
      },
      headers: {
        'user-agent': 'OpenPanel Server/1.0',
        'openpanel-sdk-name': 'server',
        'openpanel-sdk-version': '1.0.0',
        'request-id': '123',
      },
      projectId,
      deviceId: '',
      sessionId: '',
      uaInfo: uaInfoServer,
    };

    vi.mocked(sessionBuffer.getExistingSession).mockResolvedValueOnce({
      id: 'last-session-456',
      event_count: 0,
      screen_view_count: 0,
      entry_path: '/last-path',
      entry_origin: 'https://example.com',
      exit_path: '/last-path',
      exit_origin: 'https://example.com',
      created_at: formatClickhouseDate(timestamp),
      ended_at: formatClickhouseDate(timestamp),
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
      longitude: 0,
      latitude: 0,
      duration: 0,
      referrer: 'https://google.com',
      referrer_name: 'Google',
      referrer_type: 'search',
      is_bounce: false,
      utm_term: '',
      utm_source: '',
      utm_campaign: '',
      utm_content: '',
      utm_medium: '',
      revenue: 0,
      project_id: projectId,
      device_id: 'last-device-123',
      profile_id: 'profile-123',
      sign: 1,
      version: 1,
      groups: [],
    } satisfies IClickhouseSession);

    await incomingEvent(jobData);

    expect((createEvent as Mock).mock.calls[0]![0]).toStrictEqual({
      name: 'server_event',
      deviceId: 'last-device-123',
      sessionId: 'last-session-456',
      profileId: 'profile-123',
      projectId,
      properties: {
        custom_property: 'test_value',
        __hash: undefined,
        __query: undefined,
      },
      createdAt: timestamp,
      country: 'CA',
      city: 'Toronto',
      region: 'ON',
      longitude: 0,
      latitude: 0,
      os: 'iOS',
      osVersion: '15.0',
      browser: 'Safari',
      browserVersion: '15.0',
      device: 'mobile',
      brand: 'Apple',
      model: 'iPhone',
      duration: 0,
      path: '/last-path',
      origin: 'https://example.com',
      referrer: 'https://google.com',
      referrerName: 'Google',
      referrerType: 'search',
      sdkName: 'server',
      sdkVersion: '1.0.0',
      revenue: undefined,
      groups: [],
    });

    expect(sessionsQueue.add).not.toHaveBeenCalled();
  });

  it('should handle server events (without existing screen view)', async () => {
    const timestamp = new Date();
    const jobData: EventsQueuePayloadIncomingEvent['payload'] = {
      geo,
      event: {
        name: 'server_event',
        timestamp: timestamp.toISOString(),
        properties: { custom_property: 'test_value' },
        profileId: 'profile-123',
      },
      headers: {
        'user-agent': 'OpenPanel Server/1.0',
        'openpanel-sdk-name': 'server',
        'openpanel-sdk-version': '1.0.0',
        'request-id': '123',
      },
      projectId,
      deviceId: '',
      sessionId: '',
      uaInfo: uaInfoServer,
    };

    await incomingEvent(jobData);

    expect((createEvent as Mock).mock.calls[0]![0]).toStrictEqual({
      name: 'server_event',
      // Server event with profileId but no existing session: keep the
      // API-computed identity instead of blanking deviceId/sessionId.
      // The fixture sends '' for both so that's what we expect here.
      deviceId: '',
      sessionId: '',
      profileId: 'profile-123',
      projectId,
      properties: {
        custom_property: 'test_value',
        __hash: undefined,
        __query: undefined,
      },
      createdAt: timestamp,
      country: 'US',
      city: 'New York',
      region: 'NY',
      revenue: undefined,
      longitude: 0,
      latitude: 0,
      os: '',
      osVersion: '',
      browser: '',
      browserVersion: '',
      device: 'server',
      brand: '',
      model: '',
      duration: 0,
      path: '',
      origin: '',
      // baseEvent fields fall through uniformly when there's no
      // session enrichment available — empty strings for all referrer
      // fields rather than the previous mix of undefined/''.
      referrer: '',
      referrerName: '',
      referrerType: '',
      sdkName: 'server',
      sdkVersion: '1.0.0',
      groups: [],
    });

    expect(sessionsQueue.add).not.toHaveBeenCalled();
  });

  it('should emit session_start only once when 3 events arrive in rapid succession', async () => {
    // Regression test: previously the API baked `session: undefined` into every
    // payload when no session-end job existed yet. Even with sequential
    // per-device processing in the worker, the worker re-checks the BullMQ
    // session-end job at processing time, so events 2 and 3 should extend
    // rather than emit duplicate session_starts.
    const spySessionsQueueAdd = vi
      .spyOn(sessionsQueue, 'add')
      .mockResolvedValue({} as Job);
    const spySessionsQueueGetJob = vi.spyOn(sessionsQueue, 'getJob');

    const buildJobData = (
      eventName: string,
    ): EventsQueuePayloadIncomingEvent['payload'] => ({
      geo,
      event: {
        name: eventName,
        timestamp: new Date().toISOString(),
        properties: { __path: 'https://example.com/test' },
      },
      uaInfo,
      headers: {
        'request-id': '123',
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'openpanel-sdk-name': 'web',
        'openpanel-sdk-version': '1.0.0',
      },
      projectId,
      deviceId,
      sessionId: newSessionId,
    });

    // Event 1: no session-end job exists yet → emit session_start.
    spySessionsQueueGetJob.mockResolvedValueOnce(undefined);
    // Events 2 and 3: session-end job is now present (delayed) → extend only.
    const liveJob = {
      id: `sessionEnd:${projectId}:${deviceId}`,
      getState: vi.fn().mockResolvedValue('delayed'),
      changeDelay: vi.fn(),
      data: {
        type: 'createSessionEnd',
        payload: {
          sessionId: newSessionId,
          deviceId,
          referrer: '',
          referrerName: '',
          referrerType: '',
        },
      },
    } as Partial<Job> as Job;
    spySessionsQueueGetJob.mockResolvedValue(liveJob);

    (createEvent as Mock).mockImplementation((event) => event);

    await incomingEvent(buildJobData('event_a'));
    await incomingEvent(buildJobData('event_b'));
    await incomingEvent(buildJobData('event_c'));

    const sessionStartCalls = (createEvent as Mock).mock.calls.filter(
      ([arg]) => arg?.name === 'session_start',
    );
    expect(sessionStartCalls).toHaveLength(1);

    // Only the first event should have queued a session-end job; subsequent
    // events extend the existing one via changeDelay.
    expect(spySessionsQueueAdd).toHaveBeenCalledTimes(1);
  });

  it('does not emit duplicate session_start when lock is held', async () => {
    const { getLock } = await import('@openpanel/redis');
    // Simulate "another worker already claimed session_start" by failing
    // the lock acquisition. Live event still fires; sessionEnd job is
    // still scheduled (it's idempotent on jobId).
    vi.mocked(getLock).mockResolvedValueOnce(false);
    const spySessionsQueueAdd = vi
      .spyOn(sessionsQueue, 'add')
      .mockResolvedValue({} as Job);

    const timestamp = new Date();
    const jobData: EventsQueuePayloadIncomingEvent['payload'] = {
      geo,
      event: {
        name: 'live_event',
        timestamp: timestamp.toISOString(),
        properties: { __path: 'https://example.com/test' },
      },
      uaInfo,
      headers: {
        'request-id': '123',
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/91.0.4472.124',
        'openpanel-sdk-name': 'web',
        'openpanel-sdk-version': '1.0.0',
      },
      projectId,
      deviceId,
      sessionId: newSessionId,
    };
    (createEvent as Mock).mockReturnValue({});

    await incomingEvent(jobData);

    // No session_start emission (lock not acquired)
    const startCalls = (createEvent as Mock).mock.calls.filter(
      (call) => call[0]?.name === 'session_start',
    );
    expect(startCalls).toHaveLength(0);
    // Live event itself still gets created
    const liveCalls = (createEvent as Mock).mock.calls.filter(
      (call) => call[0]?.name === 'live_event',
    );
    expect(liveCalls).toHaveLength(1);
    // sessionEnd is still scheduled even when lock not acquired (idempotent)
    expect(spySessionsQueueAdd).toHaveBeenCalled();
  });

  it('historical event preserves API-computed deviceId/sessionId', async () => {
    // Event with __timestamp older than SESSION_TIMEOUT (30 min). Worker
    // should write it with the deviceId/sessionId the API computed,
    // without scheduling sessionEnd (live state untouched).
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const jobData: EventsQueuePayloadIncomingEvent['payload'] = {
      geo,
      event: {
        name: 'historical_event',
        timestamp: oneHourAgo.toISOString(),
        properties: { __path: 'https://example.com/replay' },
      },
      uaInfo,
      headers: {
        'request-id': '123',
        'user-agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15',
        'openpanel-sdk-name': 'react-native',
        'openpanel-sdk-version': '1.0.0',
      },
      projectId,
      deviceId: 'mobile-device-xyz',
      sessionId: 'deterministic-bucket-id',
    };

    (createEvent as Mock).mockReturnValue({});
    await incomingEvent(jobData);

    // Live state untouched: no sessionEnd job scheduled
    expect(sessionsQueue.add).not.toHaveBeenCalled();
    // Two createEvent calls: one for the historical session_start (lock
    // acquired by default in the redis mock), one for the event itself
    expect((createEvent as Mock).mock.calls).toHaveLength(2);
    const startCall = (createEvent as Mock).mock.calls.find(
      (call) => call[0]?.name === 'session_start',
    );
    const eventCall = (createEvent as Mock).mock.calls.find(
      (call) => call[0]?.name === 'historical_event',
    );
    expect(startCall).toBeDefined();
    expect(eventCall).toBeDefined();
    expect(eventCall![0].deviceId).toBe('mobile-device-xyz');
    expect(eventCall![0].sessionId).toBe('deterministic-bucket-id');
  });
});
