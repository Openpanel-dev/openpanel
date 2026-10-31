// The session buffer, `createEvent` and the sessions queue are recording
// doubles handed in as `IncomingEventDeps`, so the assertions are on calls
// the code under test actually made and no `mock.module` is needed.
//
// The session_end enqueue is asserted through the real `sessionEndJobPayload`
// / `sessionEndEnqueueOptions`, so the jobId and the `{payload, snapshot}`
// mapping are still pinned here, not re-implemented by the test.

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { formatClickhouseDate } from '../../event/src/dates';
import type { IClickhouseSession } from '../../session/session.service';
import {
  sessionEndEnqueueOptions,
  sessionEndJobPayload,
} from '../../session/src/session-end';
import type { IncomingEventPayload } from './incoming-event';
import {
  type IncomingEventDeps,
  incomingEvent,
} from './incoming-event-handler';

const projectId = 'test-project';
const deviceId = 'device-123';
const newSessionId = 'a1b2c3d4-e5f6-4789-a012-345678901234';
// What the producer (/track) would have minted for one request.
const producedEventId = '11111111-2222-4333-8444-555555555555';
const geo = {
  country: 'US',
  city: 'New York',
  region: 'NY',
  longitude: 0,
  latitude: 0,
};

const uaInfo: IncomingEventPayload['uaInfo'] = {
  isServer: false,
  device: 'desktop',
  os: 'Windows',
  osVersion: '10',
  browser: 'Chrome',
  browserVersion: '91.0.4472.124',
  brand: '',
  model: '',
};

const uaInfoServer: IncomingEventPayload['uaInfo'] = {
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
  overrides: Partial<IncomingEventPayload> = {}
): IncomingEventPayload {
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

const noopLogger = (() => {
  const noop = () => undefined;
  const logger = {
    fatal: noop,
    error: noop,
    warn: noop,
    info: noop,
    debug: noop,
    trace: noop,
    child: () => logger,
  };
  return logger;
})();

function makeDeps() {
  const createEvent = mock<IncomingEventDeps['createEvent']>(
    async (event) => event
  );
  const getExistingSession = mock<
    IncomingEventDeps['sessions']['getExistingSession']
  >(async () => null);
  const ingest = mock<IncomingEventDeps['sessions']['ingest']>(
    async () => null
  );
  const enqueueSessionEnd = mock<IncomingEventDeps['enqueueSessionEnd']>(
    async () => undefined
  );
  const addAiEvent = mock<IncomingEventDeps['aiEvents']['add']>(
    async () => undefined
  );
  const deps: IncomingEventDeps = {
    logger: noopLogger,
    sessions: { getExistingSession, ingest },
    createEvent,
    checkNotificationRulesForEvent: mock(async () => true),
    projects: {
      getCached: mock(async () => ({ firstEventAt: new Date(), filters: [] })),
      markFirstEvent: mock(async () => undefined),
      getAiStoreContent: mock(async () => true),
    },
    enqueueSessionEnd,
    metrics: {
      sessionStarted: mock(() => undefined),
      sessionEndEnqueued: mock(() => undefined),
    },
    aiEvents: { add: addAiEvent },
  };
  return {
    deps,
    createEvent,
    getExistingSession,
    ingest,
    enqueueSessionEnd,
    addAiEvent,
  };
}

/** Every `createEvent` call's first argument, in order. */
const createdEvents = (createEvent: {
  mock: { calls: unknown[][] };
}): Record<string, unknown>[] =>
  createEvent.mock.calls.map(([arg]) => arg as Record<string, unknown>);

let ctx: ReturnType<typeof makeDeps>;

beforeEach(() => {
  ctx = makeDeps();
});

describe('incomingEvent', () => {
  test('emits session_start when ingest returns kind="new"', async () => {
    const { deps, createEvent, ingest, enqueueSessionEnd } = ctx;
    ingest.mockResolvedValueOnce({
      kind: 'new',
      current: makeSession({ id: newSessionId }),
    });

    await incomingEvent(buildJobData(), deps);

    expect(enqueueSessionEnd).not.toHaveBeenCalled();
    const calls = createdEvents(createEvent);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.name).toBe('session_start');
    expect(calls[1]!.name).toBe('test_event');
  });

  test('skips session_start when ingest returns kind="extend"', async () => {
    const { deps, createEvent, ingest, enqueueSessionEnd } = ctx;
    ingest.mockResolvedValueOnce({ kind: 'extend', current: makeSession() });

    await incomingEvent(buildJobData(), deps);

    expect(enqueueSessionEnd).not.toHaveBeenCalled();
    const sessionStartCalls = createdEvents(createEvent).filter(
      (arg) => arg.name === 'session_start'
    );
    expect(sessionStartCalls).toHaveLength(0);
  });

  test('closes old session and emits session_start when ingest returns kind="boundary"', async () => {
    const { deps, createEvent, ingest, enqueueSessionEnd } = ctx;
    const closed = makeSession({ id: 'old-session-id' });
    const current = makeSession({ id: newSessionId });
    ingest.mockResolvedValueOnce({ kind: 'boundary', current, closed });

    await incomingEvent(buildJobData(), deps);

    expect(enqueueSessionEnd).toHaveBeenCalledTimes(1);
    const input = enqueueSessionEnd.mock.calls[0]![0];
    // The wire payload the producer builds from this input, through the same
    // core functions it calls.
    const { event, snapshot } = sessionEndJobPayload(input);
    expect(event.sessionId).toBe('old-session-id');
    expect(snapshot.id).toBe('old-session-id');
    expect(sessionEndEnqueueOptions(input.closedSession.id).jobId).toBe(
      'sessionEnd:v2:old-session-id'
    );

    const calls = createdEvents(createEvent);
    expect(calls.filter((a) => a.name === 'session_start')).toHaveLength(1);
    expect(calls.filter((a) => a.name === 'test_event')).toHaveLength(1);
  });

  test('inherits referrer from current session on the actual event', async () => {
    const { deps, createEvent, ingest } = ctx;
    ingest.mockResolvedValueOnce({
      kind: 'extend',
      current: makeSession({
        referrer: 'https://google.com',
        referrer_name: 'Google',
        referrer_type: 'search',
      }),
    });

    await incomingEvent(buildJobData(), deps);

    const testEventCall = createdEvents(createEvent).find(
      (a) => a.name === 'test_event'
    );
    expect(testEventCall!.referrer).toBe('https://google.com');
    expect(testEventCall!.referrerName).toBe('Google');
    expect(testEventCall!.referrerType).toBe('search');
  });

  test('inherits utm from current session when the event URL has none', async () => {
    const { deps, createEvent, ingest } = ctx;
    ingest.mockResolvedValueOnce({
      kind: 'extend',
      current: makeSession({
        utm_source: 'meta',
        utm_medium: 'paid_socials',
        utm_campaign: 'mega_pikr',
        utm_content: '',
        utm_term: '',
      }),
    });

    await incomingEvent(
      buildJobData({
        event: {
          name: 'registration_completed',
          timestamp: new Date().toISOString(),
          isTimestampFromThePast: false,
          properties: { __path: 'https://example.com/signup/done' },
        },
      }),
      deps
    );

    const event = createdEvents(createEvent).find(
      (a) => a.name === 'registration_completed'
    );
    expect(event!.properties).toMatchObject({
      __query: {
        utm_source: 'meta',
        utm_medium: 'paid_socials',
        utm_campaign: 'mega_pikr',
      },
    });
    const query = (event!.properties as { __query: object }).__query;
    expect(Object.keys(query)).toHaveLength(3);
  });

  test('keeps a client-sent __query and lets the URL query win over it', async () => {
    const { deps, createEvent, ingest } = ctx;
    ingest.mockResolvedValueOnce({ kind: 'extend', current: makeSession() });

    await incomingEvent(
      buildJobData({
        event: {
          name: 'screen_view',
          timestamp: new Date().toISOString(),
          isTimestampFromThePast: false,
          properties: {
            __path: 'https://example.com/?utm_source=google',
            __query: { utm_source: 'meta', utm_campaign: 'first_touch' },
          },
        },
      }),
      deps
    );

    const event = createdEvents(createEvent).find(
      (a) => a.name === 'screen_view'
    );
    expect(event!.properties).toMatchObject({
      __query: { utm_source: 'google', utm_campaign: 'first_touch' },
    });
  });

  test("keeps the event's own utm over the session's", async () => {
    const { deps, createEvent, ingest } = ctx;
    ingest.mockResolvedValueOnce({
      kind: 'extend',
      current: makeSession({ utm_source: 'meta', utm_campaign: 'first' }),
    });

    await incomingEvent(
      buildJobData({
        event: {
          name: 'screen_view',
          timestamp: new Date().toISOString(),
          isTimestampFromThePast: false,
          properties: {
            __path: 'https://example.com/?utm_source=google&utm_medium=cpc',
          },
        },
      }),
      deps
    );

    const event = createdEvents(createEvent).find(
      (a) => a.name === 'screen_view'
    );
    expect(event!.properties).toMatchObject({
      __query: {
        utm_source: 'google',
        utm_medium: 'cpc',
        utm_campaign: 'first',
      },
    });
  });

  test('server events inherit utm from the profile session they ride on', async () => {
    const { deps, createEvent, getExistingSession } = ctx;
    getExistingSession.mockResolvedValueOnce(
      makeSession({
        id: 'last-session-456',
        profile_id: 'profile-123',
        utm_source: 'meta',
        utm_campaign: 'mega_pikr',
      })
    );

    await incomingEvent(
      buildJobData({
        event: {
          name: 'server_event',
          timestamp: new Date().toISOString(),
          properties: { plan: 'pro' },
          profileId: 'profile-123',
          isTimestampFromThePast: false,
        },
        uaInfo: uaInfoServer,
        deviceId: '',
        sessionId: '',
      }),
      deps
    );

    expect(createdEvents(createEvent)[0]!.properties).toMatchObject({
      plan: 'pro',
      __query: { utm_source: 'meta', utm_campaign: 'mega_pikr' },
    });
  });

  test('handles server events with existing profile session', async () => {
    const { deps, createEvent, ingest, getExistingSession, enqueueSessionEnd } =
      ctx;
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

    getExistingSession.mockResolvedValueOnce(
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

    await incomingEvent(jobData, deps);

    expect(ingest).not.toHaveBeenCalled();
    expect(enqueueSessionEnd).not.toHaveBeenCalled();
    expect(createdEvents(createEvent)[0]!).toMatchObject({
      name: 'server_event',
      deviceId: 'last-device-123',
      sessionId: 'last-session-456',
      profileId: 'profile-123',
      city: 'Toronto',
      country: 'CA',
      referrer: 'https://google.com',
    });
  });

  test('handles server events without any active session', async () => {
    const { deps, createEvent, ingest, getExistingSession, enqueueSessionEnd } =
      ctx;
    getExistingSession.mockResolvedValueOnce(null);

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
      }),
      deps
    );

    expect(ingest).not.toHaveBeenCalled();
    expect(enqueueSessionEnd).not.toHaveBeenCalled();
    expect(createdEvents(createEvent)[0]!).toMatchObject({
      name: 'server_event',
      deviceId: '',
      sessionId: '',
      profileId: 'profile-123',
    });
  });

  test('re-creates the same row id when Kafka redelivers the message', async () => {
    const { deps, createEvent, ingest } = ctx;
    const session = makeSession({ id: newSessionId });
    ingest
      .mockResolvedValueOnce({ kind: 'new', current: session })
      .mockResolvedValueOnce({ kind: 'extend', current: session });

    // Same message, delivered twice: identical payload, identical offset.
    const jobData = buildJobData({ id: producedEventId });
    const delivery = { partition: 3, offset: '42' };
    await incomingEvent(jobData, deps, delivery);
    await incomingEvent(jobData, deps, delivery);

    const eventCalls = createdEvents(createEvent).filter(
      (a) => a.name === 'test_event'
    );
    expect(eventCalls).toHaveLength(2);
    expect(eventCalls[0]!.id).toBe(producedEventId);
    expect(eventCalls[1]!.id).toBe(producedEventId);

    // The derived session_start row must NOT reuse the event's id.
    const sessionStartCalls = createdEvents(createEvent).filter(
      (a) => a.name === 'session_start'
    );
    expect(sessionStartCalls).toHaveLength(1);
    expect(sessionStartCalls[0]!.id).toBeString();
    expect(sessionStartCalls[0]!.id).not.toBe(producedEventId);
  });

  test('keeps derived session_start ids stable across concurrent new-session deliveries', async () => {
    const { deps, createEvent, ingest } = ctx;
    ingest.mockResolvedValue({
      kind: 'new',
      current: makeSession({ id: newSessionId }),
    });
    const job = buildJobData({ id: producedEventId });
    await Promise.all([incomingEvent(job, deps), incomingEvent(job, deps)]);
    const starts = createdEvents(createEvent).filter(
      (event) => event.name === 'session_start'
    );
    expect(starts).toHaveLength(2);
    expect(starts[0]!.id).toBe(starts[1]!.id);
    expect(starts[0]!.id).not.toBe(producedEventId);
  });

  test('carries the producer-minted id on server-side events', async () => {
    const { deps, createEvent, getExistingSession } = ctx;
    getExistingSession.mockResolvedValueOnce(null);

    await incomingEvent(
      buildJobData({
        id: producedEventId,
        event: {
          name: 'server_event',
          timestamp: new Date().toISOString(),
          isTimestampFromThePast: false,
          profileId: 'profile-123',
        },
        uaInfo: uaInfoServer,
        deviceId: '',
        sessionId: '',
      }),
      deps
    );

    expect(createdEvents(createEvent)[0]!.id).toBe(producedEventId);
  });

  test('leaves the id undefined for a payload produced without one', async () => {
    const { deps, createEvent, ingest } = ctx;
    ingest.mockResolvedValueOnce({ kind: 'extend', current: makeSession() });

    await incomingEvent(buildJobData(), deps);

    expect(createdEvents(createEvent)[0]!.id).toBeUndefined();
  });

  test('emits session_start only once across 3 rapid events (new → extend → extend)', async () => {
    const { deps, createEvent, ingest, enqueueSessionEnd } = ctx;
    const session = makeSession({ id: newSessionId });
    ingest
      .mockResolvedValueOnce({ kind: 'new', current: session })
      .mockResolvedValueOnce({ kind: 'extend', current: session })
      .mockResolvedValueOnce({ kind: 'extend', current: session });

    for (const name of ['e1', 'e2', 'e3']) {
      await incomingEvent(
        buildJobData({
          event: {
            name,
            timestamp: new Date().toISOString(),
            isTimestampFromThePast: false,
            properties: { __path: 'https://example.com/test' },
          },
        }),
        deps
      );
    }

    const sessionStartCalls = createdEvents(createEvent).filter(
      (a) => a.name === 'session_start'
    );
    expect(sessionStartCalls).toHaveLength(1);
    expect(enqueueSessionEnd).not.toHaveBeenCalled();
  });
});

describe('incomingEvent with an ai row', () => {
  const aiDraft = {
    type: 'generation' as const,
    trace_id: 'trace_1',
    span_id: '',
    parent_id: '',
    conversation_id: '',
    name: 'summarize',
    model: 'gpt-5-mini',
    provider: 'openai',
    input_tokens: 10,
    output_tokens: 5,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    reasoning_tokens: 0,
    input_cost: 0.1,
    output_cost: 0.2,
    total_cost: 0.3,
    cost_source: 'catalog' as const,
    latency_ms: 100,
    time_to_first_token_ms: 0,
    is_error: false,
    http_status: 0,
    stop_reason: 'stop',
    is_stream: false,
    model_parameters: '',
    input: '[{"role":"user"}]',
    output: '[{"role":"assistant"}]',
    tools: '[]',
    error: '',
    properties: {},
  };
  const storedDocument = {
    id: producedEventId,
    project_id: projectId,
    profile_id: 'usr_1',
    device_id: deviceId,
    session_id: 'session-from-profile',
    groups: ['acme'],
    created_at: '2026-10-26 10:00:00.000',
  };

  function aiJob(): IncomingEventPayload {
    return buildJobData({
      id: producedEventId,
      uaInfo: uaInfoServer,
      event: {
        name: 'ai_generation',
        profileId: 'usr_1',
        groups: ['acme'],
        properties: { ai_model: 'gpt-5-mini' },
        timestamp: Date.now(),
        isTimestampFromThePast: false,
      },
      ai: aiDraft,
    });
  }

  test('writes the ai row with the identity the events row resolved to', async () => {
    const { deps, createEvent, addAiEvent } = ctx;
    createEvent.mockResolvedValueOnce({ document: storedDocument });

    await incomingEvent(aiJob(), deps);

    expect(createEvent).toHaveBeenCalledTimes(1);
    expect(addAiEvent).toHaveBeenCalledTimes(1);
    expect(addAiEvent.mock.calls[0]![0]).toMatchObject({
      ...storedDocument,
      span_id: producedEventId,
      model: 'gpt-5-mini',
      input: '[{"role":"user"}]',
    });
  });

  test('the project privacy setting blanks the content', async () => {
    const { deps, createEvent, addAiEvent } = ctx;
    createEvent.mockResolvedValueOnce({ document: storedDocument });
    (
      deps.projects.getAiStoreContent as ReturnType<typeof mock>
    ).mockResolvedValue(false);

    await incomingEvent(aiJob(), deps);

    expect(addAiEvent).toHaveBeenCalledTimes(1);
    expect(addAiEvent.mock.calls[0]![0]).toMatchObject({
      input: '',
      output: '',
      tools: '',
      input_tokens: 10,
    });
  });

  test('an event the project filter excludes leaves no ai row', async () => {
    const { deps, createEvent, addAiEvent } = ctx;
    (deps.projects.getCached as ReturnType<typeof mock>).mockResolvedValue({
      firstEventAt: new Date(),
      filters: [
        { type: 'event', name: 'ai_generation', segment: 'event', filters: [] },
      ],
    });

    await incomingEvent(aiJob(), deps);

    expect(createEvent).not.toHaveBeenCalled();
    expect(addAiEvent).not.toHaveBeenCalled();
  });
});
