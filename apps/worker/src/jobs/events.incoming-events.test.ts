import { createEvent, getLastScreenViewFromProfileId } from '@openpanel/db';
import { sessionsQueue } from '@openpanel/queue';
import type { Job } from 'bullmq';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { incomingEvent } from './events.incoming-event';

vi.mock('@openpanel/queue');
vi.mock('@openpanel/db', async () => {
  const actual = await vi.importActual('@openpanel/db');
  return {
    ...actual,
    createEvent: vi.fn(),
    getLastScreenViewFromProfileId: vi.fn(),
    checkNotificationRulesForEvent: vi.fn(),
  };
});

// 30 minutes
const SESSION_TIMEOUT = 30 * 60 * 1000;
const projectId = 'test-project';
const currentDeviceId = 'device-123';
const previousDeviceId = 'device-456';
const geo = {
  country: 'US',
  city: 'New York',
  region: 'NY',
  longitude: 0,
  latitude: 0,
};

describe('incomingEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a session start and an event', async () => {
    const timestamp = new Date();
    // Mock job data
    const jobData = {
      payload: {
        geo,
        event: {
          name: 'test_event',
          timestamp: timestamp.toISOString(),
          properties: { __path: 'https://example.com/test' },
        },
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'openpanel-sdk-name': 'web',
          'openpanel-sdk-version': '1.0.0',
        },
        projectId,
        currentDeviceId,
        previousDeviceId,
        priority: true,
      },
    };

    const job = { data: jobData } as Job;

    // Execute the job
    await incomingEvent(job);

    const event = {
      name: 'test_event',
      deviceId: currentDeviceId,
      profileId: '',
      sessionId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
      projectId,
      properties: {
        __hash: undefined,
        __query: undefined,
        user_agent: jobData.payload.headers['user-agent'],
      },
      createdAt: timestamp,
      country: 'US',
      city: 'New York',
      region: 'NY',
      longitude: 0,
      latitude: 0,
      os: 'Windows',
      osVersion: '10',
      browser: 'Chrome',
      browserVersion: '91.0.4472.124',
      device: 'desktop',
      brand: undefined,
      model: undefined,
      duration: 0,
      path: '/test',
      origin: 'https://example.com',
      referrer: '',
      referrerName: '',
      referrerType: 'unknown',
      sdkName: jobData.payload.headers['openpanel-sdk-name'],
      sdkVersion: jobData.payload.headers['openpanel-sdk-version'],
    };

    const spySessionsQueueAdd = vi.spyOn(sessionsQueue, 'add');

    expect(spySessionsQueueAdd).toHaveBeenCalledWith(
      'session',
      {
        type: 'createSessionEnd',
        payload: expect.objectContaining(event),
      },
      {
        delay: SESSION_TIMEOUT,
        jobId: `sessionEnd:${projectId}:${currentDeviceId}`,
      },
    );

    expect((createEvent as Mock).mock.calls[0]).toMatchObject([
      {
        ...event,
        createdAt: new Date(timestamp.getTime() - 100),
        name: 'session_start',
      },
    ]);
    expect((createEvent as Mock).mock.calls[1]).toMatchObject([event]);
  });

  it('should reuse existing session', async () => {
    const timestamp = new Date();
    // Mock job data
    const jobData = {
      payload: {
        geo,
        event: {
          name: 'test_event',
          timestamp: timestamp.toISOString(),
          properties: { __path: 'https://example.com/test' },
        },
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'openpanel-sdk-name': 'web',
          'openpanel-sdk-version': '1.0.0',
        },
        projectId,
        currentDeviceId,
        previousDeviceId,
        priority: true,
      },
    };

    const job = { data: jobData } as Job;

    const spySessionsQueueAdd = vi.spyOn(sessionsQueue, 'add');
    const spySessionsQueueGetJob = vi.spyOn(sessionsQueue, 'getJob');

    const changeDelay = vi.fn();
    spySessionsQueueGetJob.mockResolvedValueOnce({
      getState: vi.fn().mockResolvedValue('delayed'),
      changeDelay,
      data: {
        type: 'createSessionEnd',
        payload: {
          sessionId: 'session-123',
          deviceId: currentDeviceId,
          profileId: currentDeviceId,
          projectId,
        },
      },
    } as Partial<Job> as Job);
    // Execute the job
    await incomingEvent(job);

    const event = {
      name: 'test_event',
      deviceId: currentDeviceId,
      profileId: '',
      sessionId: 'session-123',
      projectId,
      properties: {
        __hash: undefined,
        __query: undefined,
        user_agent: jobData.payload.headers['user-agent'],
      },
      createdAt: timestamp,
      country: 'US',
      city: 'New York',
      region: 'NY',
      longitude: 0,
      latitude: 0,
      os: 'Windows',
      osVersion: '10',
      browser: 'Chrome',
      browserVersion: '91.0.4472.124',
      device: 'desktop',
      brand: undefined,
      model: undefined,
      duration: 0,
      path: '/test',
      origin: 'https://example.com',
      referrer: '',
      referrerName: '',
      referrerType: 'unknown',
      sdkName: jobData.payload.headers['openpanel-sdk-name'],
      sdkVersion: jobData.payload.headers['openpanel-sdk-version'],
    };

    expect(spySessionsQueueAdd).toHaveBeenCalledTimes(0);
    expect(changeDelay).toHaveBeenCalledWith(SESSION_TIMEOUT);
    expect(createEvent as Mock).toBeCalledTimes(1);
    expect((createEvent as Mock).mock.calls[0]).toMatchObject([event]);
  });

  it('should handle server events (with existing screen view)', async () => {
    const timestamp = new Date();
    const jobData = {
      payload: {
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
        },
        projectId,
        currentDeviceId: '',
        previousDeviceId: '',
        priority: true,
      },
    };

    const job = { data: jobData } as Job;

    const mockLastScreenView = {
      deviceId: 'last-device-123',
      sessionId: 'last-session-456',
      country: 'CA',
      city: 'Toronto',
      region: 'ON',
      os: 'iOS',
      osVersion: '15.0',
      browser: 'Safari',
      browserVersion: '15.0',
      device: 'mobile',
      brand: 'Apple',
      model: 'iPhone',
      path: '/last-path',
      origin: 'https://example.com',
      referrer: 'https://google.com',
      referrerName: 'Google',
      referrerType: 'search',
    };

    (getLastScreenViewFromProfileId as Mock).mockReturnValueOnce(
      mockLastScreenView,
    );

    await incomingEvent(job);

    expect((createEvent as Mock).mock.calls[0]).toMatchObject([
      {
        name: 'server_event',
        deviceId: 'last-device-123',
        sessionId: 'last-session-456',
        profileId: 'profile-123',
        projectId,
        properties: {
          custom_property: 'test_value',
          user_agent: 'OpenPanel Server/1.0',
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
      },
    ]);

    expect(sessionsQueue.add).not.toHaveBeenCalled();
  });

  it('should handle server events (without existing screen view)', async () => {
    const timestamp = new Date();
    const jobData = {
      payload: {
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
        },
        projectId,
        currentDeviceId: '',
        previousDeviceId: '',
        priority: true,
      },
    };

    const job = { data: jobData } as Job;

    (getLastScreenViewFromProfileId as Mock).mockReturnValueOnce(null);

    await incomingEvent(job);

    expect((createEvent as Mock).mock.calls[0]).toMatchObject([
      {
        name: 'server_event',
        deviceId: '',
        sessionId: '',
        profileId: 'profile-123',
        projectId,
        properties: {
          custom_property: 'test_value',
          user_agent: 'OpenPanel Server/1.0',
        },
        createdAt: timestamp,
        country: 'US',
        city: 'New York',
        region: 'NY',
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
      },
    ]);

    expect(sessionsQueue.add).not.toHaveBeenCalled();
  });
});
