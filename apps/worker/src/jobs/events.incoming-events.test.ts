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
    const spySessionsQueueAdd = vi.spyOn(sessionsQueue, 'add');
    const timestamp = new Date();
    // Mock job data
    const jobData: EventsQueuePayloadIncomingEvent['payload'] = {
      geo,
      event: {
        name: 'test_event',
        timestamp: timestamp.toISOString(),
        isTimestampFromThePast: false,
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
        isTimestampFromThePast: false,
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
        isTimestampFromThePast: false,
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
      screen_views: [],
      sign: 1,
      version: 1,
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
        isTimestampFromThePast: false,
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
      referrer: undefined,
      referrerName: undefined,
      referrerType: undefined,
      sdkName: 'server',
      sdkVersion: '1.0.0',
    });

    expect(sessionsQueue.add).not.toHaveBeenCalled();
  });
});
