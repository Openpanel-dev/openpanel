import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  OpenPanel,
  type ReplayPayload,
  type TrackHandlerPayload,
} from './index';

const IDENTITY = { deviceId: 'stable-device', sessionId: 'tracked-session' };
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** Capture serialized requests and wait for the fire-and-forget replay flush. */
function captureRequests(
  replayCount: number,
  trackResponse = Promise.resolve(Response.json(IDENTITY))
) {
  const requests: {
    body: TrackHandlerPayload;
    keepalive: boolean | undefined;
  }[] = [];
  const trackStarted = Promise.withResolvers<void>();
  const replaysSent = Promise.withResolvers<void>();
  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as TrackHandlerPayload;
    requests.push({ body, keepalive: init?.keepalive });
    if (body.type === 'track') {
      trackStarted.resolve();
      return trackResponse;
    }
    if (
      requests.filter((request) => request.body.type === 'replay').length ===
      replayCount
    ) {
      replaysSent.resolve();
    }
    return Response.json(IDENTITY);
  }) as typeof fetch;
  return {
    requests,
    trackStarted: trackStarted.promise,
    replaysSent: replaysSent.promise,
  };
}

/** A full snapshot followed by incremental chunks, without a known session. */
function replay(
  chunkIndex: number,
  sessionId?: string
): TrackHandlerPayload & { type: 'replay' } {
  const payload: ReplayPayload = {
    chunk_index: chunkIndex,
    events_count: 1,
    is_full_snapshot: chunkIndex === 0,
    started_at: '2026-10-23T00:00:00.000Z',
    ended_at: '2026-10-23T00:00:01.000Z',
    payload: JSON.stringify([{ type: chunkIndex === 0 ? 2 : 3 }]),
    ...(sessionId === undefined ? {} : { sessionId }),
  };
  return { type: 'replay', payload };
}

test('early replay chunks use the session returned for the explicit device id', async () => {
  const trackResponse = Promise.withResolvers<Response>();
  const transport = captureRequests(3, trackResponse.promise);
  const sdk = new OpenPanel({ clientId: 'fixture' });
  const chunks = [replay(0), replay(1), replay(2)];
  await sdk.send(chunks[0]!);
  await sdk.send(chunks[1]!);
  assert.equal(transport.requests.length, 0);

  const tracking = sdk.track('screen_view', { __deviceId: IDENTITY.deviceId });
  await transport.trackStarted;
  await sdk.send(chunks[2]!);
  assert.equal(sdk.queue.length, 3);
  assert.equal(transport.requests.length, 1);
  trackResponse.resolve(Response.json(IDENTITY));
  await tracking;
  await transport.replaysSent;

  assert.deepEqual(transport.requests[0]?.body, {
    type: 'track',
    payload: {
      name: 'screen_view',
      properties: { __deviceId: IDENTITY.deviceId },
    },
  });
  for (const [index, request] of transport.requests.slice(1).entries()) {
    assert.deepEqual(request.body, {
      type: 'replay',
      payload: { ...chunks[index]!.payload, sessionId: IDENTITY.sessionId },
    });
    assert.equal(request.keepalive, false);
    assert.equal(chunks[index]!.payload.sessionId, undefined);
  }
  assert.equal(sdk.queue.length, 0);
});

test('ready keeps unbound replay queued until a tracking response establishes the session', async () => {
  const transport = captureRequests(1);
  const sdk = new OpenPanel({ clientId: 'fixture', disabled: true });
  await sdk.send(replay(0));
  sdk.ready();
  assert.equal(sdk.queue.length, 1);
  assert.equal(transport.requests.length, 0);
  await sdk.track('screen_view', { __deviceId: IDENTITY.deviceId });
  await transport.replaysSent;
  assert.equal(
    (transport.requests[1]?.body.payload as ReplayPayload).sessionId,
    IDENTITY.sessionId
  );
});

test('flushing an explicitly bound replay preserves its original session', async () => {
  const transport = captureRequests(1);
  const sdk = new OpenPanel({ clientId: 'fixture', disabled: true });
  sdk.sessionId = 'original-session';
  const chunk = replay(0, sdk.sessionId);
  await sdk.send(chunk);
  sdk.sessionId = 'new-session';
  sdk.ready();
  await transport.replaysSent;
  assert.deepEqual(transport.requests[0]?.body, chunk);
});
