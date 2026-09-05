// Ported from packages/db/src/services/create-event-id.test.ts (M7-002).
// `createEvent` reaches the buffers lazily (`loadBuffers`), so the buffer
// mock is installed before the subject is imported; spread-actual + snapshot
// restore, same as realtime.service.test.ts.

import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';

const add = mock((_event: { id: string }) => undefined);

const actualBuffers = await import('@openpanel/queue/src/buffers');
const realBuffers = { ...actualBuffers };
mock.module('@openpanel/queue/src/buffers', () => ({
  ...realBuffers,
  eventBuffer: { add },
  botBuffer: { add: mock(() => undefined) },
}));

afterAll(() => {
  mock.module('@openpanel/queue/src/buffers', () => realBuffers);
});

let createEvent: typeof import('../event.service').createEvent;
beforeAll(async () => {
  ({ createEvent } = await import('../event.service'));
});

const PRODUCED_EVENT_ID = '11111111-2222-4333-8444-555555555555';
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const payload = {
  name: 'test_event',
  deviceId: '',
  profileId: '',
  projectId: 'test-project',
  sessionId: '',
  properties: {},
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  country: '',
  city: '',
  region: '',
  longitude: undefined,
  latitude: undefined,
  os: '',
  osVersion: '',
  browser: '',
  browserVersion: '',
  device: '',
  brand: '',
  model: '',
  duration: 0,
  path: '',
  origin: '',
  referrer: '',
  referrerName: '',
  referrerType: '',
  sdkName: '',
  sdkVersion: '',
  groups: [],
};

describe('createEvent id', () => {
  test('uses the producer-minted id for the ClickHouse row', async () => {
    add.mockClear();

    const first = await createEvent({ ...payload, id: PRODUCED_EVENT_ID });
    // The same message redelivered by Kafka.
    const second = await createEvent({ ...payload, id: PRODUCED_EVENT_ID });

    expect(add).toHaveBeenCalledTimes(2);
    expect(add.mock.calls[0]?.[0].id).toBe(PRODUCED_EVENT_ID);
    expect(add.mock.calls[1]?.[0].id).toBe(PRODUCED_EVENT_ID);
    expect(first.document.id).toBe(second.document.id);
  });

  test('falls back to a generated uuid when the payload carries no id', async () => {
    add.mockClear();

    await createEvent({ ...payload });
    await createEvent({ ...payload });

    expect(add).toHaveBeenCalledTimes(2);
    const [firstId, secondId] = add.mock.calls.map(([event]) => event.id);
    expect(firstId).toMatch(UUID_V4);
    expect(secondId).toMatch(UUID_V4);
    expect(firstId).not.toBe(secondId);
  });
});
