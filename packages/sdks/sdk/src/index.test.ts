import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { OpenPanel, type TrackHandlerPayload } from './index';

const IDENTITY = { deviceId: 'device-1', sessionId: 'session-1' };
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function respondWith(...responses: unknown[]) {
  const requests: TrackHandlerPayload[] = [];
  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return Response.json(responses[requests.length - 1]);
  };
  return requests;
}

function createSdk() {
  return new OpenPanel({ clientId: 'test-client', sdkVersion: 'test' });
}

function replay(sessionId?: string): TrackHandlerPayload {
  return {
    type: 'replay',
    payload: {
      sessionId,
      chunk_index: 0,
      events_count: 1,
      is_full_snapshot: true,
      started_at: '2026-10-23T00:00:00Z',
      ended_at: '2026-10-23T00:00:01Z',
      payload: 'snapshot',
    },
  };
}

test('a duplicate acknowledgement preserves identity and does not stall replay', async () => {
  const requests = respondWith(IDENTITY, { duplicate: true }, IDENTITY);
  const sdk = createSdk();

  await sdk.track('screen_view');
  await sdk.track('screen_view');

  assert.equal(sdk.deviceId, IDENTITY.deviceId);
  assert.equal(sdk.sessionId, IDENTITY.sessionId);
  assert.equal(requests.length, 2);

  await sdk.send(replay(sdk.sessionId));

  assert.equal(sdk.queue.length, 0);
  assert.equal(requests.length, 3);
  assert.deepEqual(requests[2], replay(IDENTITY.sessionId));
});

test('a duplicate without identity waits for a real identity before flushing replay', async () => {
  const requests = respondWith({ duplicate: true }, IDENTITY, IDENTITY);
  const sdk = createSdk();

  await sdk.send(replay());
  await sdk.track('screen_view');

  assert.equal(sdk.deviceId, undefined);
  assert.equal(sdk.sessionId, undefined);
  assert.equal(sdk.queue.length, 1);
  assert.equal(requests.length, 1);

  await sdk.track('next_event');
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(sdk.deviceId, IDENTITY.deviceId);
  assert.equal(sdk.sessionId, IDENTITY.sessionId);
  assert.equal(sdk.queue.length, 0);
  assert.equal(requests.length, 3);
  assert.equal(requests[2]?.type, 'replay');
});

test('regular responses still replace identity when the session changes', async () => {
  const nextIdentity = { deviceId: 'device-2', sessionId: 'session-2' };
  const requests = respondWith(IDENTITY, nextIdentity);
  const sdk = createSdk();

  await sdk.track('first');
  await sdk.track('next_session');

  assert.equal(sdk.deviceId, nextIdentity.deviceId);
  assert.equal(sdk.sessionId, nextIdentity.sessionId);
  assert.equal(requests.length, 2);

  sdk.clear();
  assert.equal(sdk.deviceId, undefined);
  assert.equal(sdk.sessionId, undefined);
});
